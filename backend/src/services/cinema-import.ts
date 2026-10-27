import {assertHealthySnapshot,identityFingerprint,type CinemaChain,type CinemaEntry,type CinemaSnapshot} from '../domain/cinema.js';
import {CinemaRepository,type CinemaMapping} from '../repositories/cinema-repository.js';
import {cinemaCityIdentity,fetchCinemaSnapshot} from './cinema-sources.js';
import type {ContentItem} from '../domain/types.js';

type ImportDependencies={fetchSnapshot:(chain:CinemaChain)=>Promise<CinemaSnapshot>;enrich:(entry:CinemaEntry)=>Promise<CinemaEntry>;match:(entry:CinemaEntry)=>Promise<ContentItem|null>};
export class CinemaImporter {
  constructor(private repo:CinemaRepository,private deps:ImportDependencies){}
  static dependencies(match:ImportDependencies['match']):ImportDependencies{return {fetchSnapshot:fetchCinemaSnapshot,enrich:cinemaCityIdentity,match};}
  async sync(chain:CinemaChain,{dryRun=false,now=Date.now(),maxMatches=80,deadline=Date.now()+6*60000}={}){
    const before=await this.repo.state(chain);
    const snapshot=await this.deps.fetchSnapshot(chain);
    assertHealthySnapshot(snapshot,before);
    const previous=new Map((await this.repo.mappings(chain)).map(m=>[m.sourceId,m]));
    const matched:CinemaMapping[]=[];let attempted=0,unresolved=0,deferred=0,budgetExhausted=false;
    for(const entry of snapshot.entries){
      const old=previous.get(entry.sourceId);
      const reusable=old?.title===entry.title&&old.tmdbId&&now-old.checkedAt<30*86400000;
      if(reusable){matched.push(old);continue;}
      // Failed matching is retried after one day, not on every manual rerun.
      if(old?.title===entry.title&&!old.tmdbId&&now-old.checkedAt<86400000&&JSON.parse(old.evidenceJson).version===3){unresolved++;continue;}
      if(budgetExhausted||attempted>=maxMatches||Date.now()>deadline){
        deferred++;
        if(old&&old.title!==entry.title)matched.push({...old,title:entry.title,tmdbId:null,movieJson:null,identityHash:'pending',evidenceJson:'{"version":0}',checkedAt:0,dateHistoryJson:'[]'});
        continue;
      }
      attempted++;
      const enriched=chain==='cinema_city'?await this.deps.enrich(entry):entry;
      let item:ContentItem|null;
      try {item=await this.deps.match(enriched);}
      catch(error){
        if(error instanceof Error&&error.message==='CINEMA_MATCH_BUDGET'){
          budgetExhausted=true;deferred++;
          if(old&&old.title!==entry.title)matched.push({...old,title:entry.title,tmdbId:null,movieJson:null,identityHash:'pending',evidenceJson:'{"version":0}',checkedAt:0,dateHistoryJson:'[]'});
          continue;
        }
        throw error;
      }
      if(!item)unresolved++;
      matched.push({chain,sourceId:entry.sourceId,title:entry.title,identityHash:identityFingerprint(enriched),tmdbId:item?.id??null,
        evidenceJson:JSON.stringify({originalTitle:enriched.originalTitle,originalYear:enriched.originalYear,directors:enriched.directors,actors:enriched.actors,version:3}),
        movieJson:item?JSON.stringify({...item,availability:[]}):null,checkedAt:now,dateHistoryJson:old?.dateHistoryJson??'[]'});
    }
    // A partial identity-enrichment batch is allowed; every source ID still
    // participates in membership reconciliation so deferred matches are not absences.
    const result=dryRun?{changed:0,total:snapshot.entries.length,matched:matched.filter(m=>m.tmdbId).length}
      :await this.repo.publish(snapshot,matched,before?.version??0,now);
    return {chain,dryRun,...result,attempted,unresolved,deferred};
  }
}
