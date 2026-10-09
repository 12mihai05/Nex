import type {ContentItem} from '../domain/types.js';
export const normalizeSearch=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function distance(a:string,b:string){
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]!+1,prev[j]!+1,prev[j-1]!+(a[i-1]===b[j-1]?0:1));prev=row;}
 return prev[b.length]!;
}
export function titleRelevance(query:string,title:string):number{
 const q=normalizeSearch(query),t=normalizeSearch(title);if(!q||!t)return 0;
 if(q===t)return 1;
 const tokens=q.split(' '),words=t.split(' ');
 if(tokens.every(k=>words.includes(k)))return .94;
 if(t.includes(q))return .88;
 if(q.length<5||t.length>180||Math.abs(t.length-q.length)>Math.max(3,q.length*.2))return 0;
 const similarity=1-distance(q,t)/Math.max(q.length,t.length);
 return similarity>=.8?similarity*.85:0;
}
export function rankSearch(query:string,items:ContentItem[]):ContentItem[]{
 // Keep upstream order when the local title does not expose the matching alias.
 // Only strong lexical matches are promoted; popularity never overrides exactness.
 return items.map((item,index)=>({item,index,score:Math.max(titleRelevance(query,item.title),titleRelevance(query,item.originalTitle??''))}))
  .sort((a,b)=>b.score-a.score||a.index-b.index).map(r=>r.item);
}
