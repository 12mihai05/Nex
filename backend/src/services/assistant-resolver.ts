import type {ContentItem} from '../domain/types.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import {normalizeSearch,titleRelevance} from './search-ranking.js';
import {titleKey} from './recommendation.js';

// Read-only entity resolution tolerates a transposition plus one small typo.
// Keep general search ranking unchanged and require a clear winning candidate.
function typoSimilarity(query:string,title:string){
  const a=normalizeSearch(query),b=normalizeSearch(title);
  if(a.length<6||b.length<6||a.length>180||b.length>180||Math.abs(a.length-b.length)>2)return 0;
  const d=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i]![j]=Math.min(d[i-1]![j]!+1,d[i]![j-1]!+1,d[i-1]![j-1]!+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i]![j]=Math.min(d[i]![j]!,d[i-2]![j-2]!+1);
  }
  const edits=d[a.length]![b.length]!,similarity=1-edits/Math.max(a.length,b.length);
  return edits<=2&&similarity>=.7?similarity:0;
}

/** Preserve provider aliases and tolerate small typos, but never guess between remakes. */
export async function resolveAssistantTitle(catalog:TmdbRepository,query:string,country:string,type:'movie'|'series'|'any',year:number|null){
  let candidates=[...new Map((await catalog.search({query,region:country,summaryOnly:true})).filter(i=>type==='any'||i.mediaType===type).map(i=>[titleKey(i),i])).values()];
  if(year!==null){
    // Regional search dates can differ from the canonical first-release year.
    // Verify a few strong name matches before rejecting them; never treat a
    // nearby year alone as proof, drop the requested year or guess a remake.
    const mismatches=candidates.filter(i=>i.year!==year).map(item=>({item,score:Math.max(titleRelevance(query,item.title),titleRelevance(query,item.originalTitle??''),typoSimilarity(query,item.title),typoSimilarity(query,item.originalTitle??''))})).filter(r=>r.score>=.68).sort((a,b)=>b.score-a.score).slice(0,4);
    const verified=await Promise.all(mismatches.map(async({item})=>{
      const details=await catalog.getTitle(item.mediaType,item.id,country).catch(()=>null);
      return details&&titleKey(details)===titleKey(item)?details:null;
    }));
    const byKey=new Map(verified.filter((i):i is ContentItem=>!!i).map(i=>[titleKey(i),i]));
    candidates=candidates.map(i=>byKey.get(titleKey(i))??i);
  }
  const rows=candidates.filter(i=>year===null||i.year===year);
  const scored=rows.map(item=>({item,score:Math.max(titleRelevance(query,item.title),titleRelevance(query,item.originalTitle??''))})).sort((a,b)=>b.score-a.score);
  const exact=scored.filter(r=>r.score===1);
  let match:ContentItem|undefined=exact.length===1?exact[0]!.item:undefined;
  if(!exact.length&&scored[0]&&scored[0].score>=.68&&(!scored[1]||scored[0].score-scored[1].score>=.12))match=scored[0].item;
  if(!match&&!exact.length){
    const fuzzy=rows.map(item=>({item,score:Math.max(typoSimilarity(query,item.title),typoSimilarity(query,item.originalTitle??''))})).sort((a,b)=>b.score-a.score);
    if(fuzzy[0]&&fuzzy[0].score>=.7&&(!fuzzy[1]||fuzzy[0].score-fuzzy[1].score>=.12))match=fuzzy[0].item;
  }
  if(!match&&!exact.length&&catalog.titleAliases){
    const aliasMatches=await Promise.all(scored.slice(0,4).map(async r=>(await catalog.titleAliases!(r.item.mediaType,r.item.id).catch(()=>[])).some(a=>normalizeSearch(a)===normalizeSearch(query))?r.item:null));
    const found=aliasMatches.filter((i):i is ContentItem=>!!i);if(found.length===1)match=found[0];
  }
  return {status:match?'resolved':rows.length?'ambiguous':'not_found',match,choices:match?[]:scored.slice(0,5).map(r=>r.item)};
}
