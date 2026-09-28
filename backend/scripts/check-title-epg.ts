import "../src/env.js";
import {getDatabase,closeDatabase} from "../src/db/client.js";
import {sql} from "drizzle-orm";
import {createTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {EpgService} from "../src/services/epg/service.js";

try {
  const db=getDatabase();
  const rows=await db.all(sql`select c.display_name as channel,p.title,p.category,p.year,p.start_at,p.end_at,p.matched_tmdb_id,p.matched_media_type,p.match_confidence from epg_programs p join channels c on c.id=p.channel_id where c.country='RO' and (lower(p.title) like '%maze%' or lower(p.title) like '%labirint%' or (lower(c.display_name) like '%antena 1%' and p.end_at>${Date.now()-86400000} and p.start_at<${Date.now()+86400000})) order by p.start_at desc limit 35`);
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),listings:rows}));
  const catalog=createTmdbRepository();
  const item=(await catalog.search({query:"Maze Runner: The Death Cure",region:"RO"})).find(i=>i.mediaType==="movie"&&i.year===2018);
  if(!item)throw Error("TITLE_NOT_FOUND");
  const matched=await new EpgService(db,undefined,catalog).broadcastsForTitle(item,"RO");
  console.log(JSON.stringify({title:item.title,id:item.id,broadcasts:matched.map(p=>({channel:p.channel.name,title:p.title,startAt:p.startAt,endAt:p.endAt})),verifiedAntena1:matched.some(p=>p.channel.name==="Antena 1")}));
} catch { console.log("EPG inspection failed; sensitive error details suppressed.");process.exitCode=1; }
finally {await closeDatabase();}
