import '../src/env.js';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {sql} from 'drizzle-orm';
try {
  const rows=await getDatabase().all<Record<string,string|number>>(sql`SELECT c.country,count(distinct c.id) channels,count(*) programmes,min(p.start_at) earliest,max(p.end_at) latest FROM epg_programs p JOIN channels c ON c.id=p.channel_id WHERE p.end_at>${Date.now()} GROUP BY c.country`);
  console.log(JSON.stringify(rows.map(r=>({...r,earliest:new Date(Number(r.earliest)).toISOString(),latest:new Date(Number(r.latest)).toISOString()}))));
  const buckets=await getDatabase().all<Record<string,string|number>>(sql`SELECT c.source_id source,count(distinct c.id) channels,max(p.end_at) latest FROM epg_programs p JOIN channels c ON c.id=p.channel_id WHERE c.country='RO' AND p.end_at>${Date.now()} GROUP BY c.source_id`);
  console.log(JSON.stringify(buckets.map(r=>({...r,latest:new Date(Number(r.latest)).toISOString()}))));
  const runs=await getDatabase().all(sql`SELECT source_id,status,started_at,finished_at,imported_rows FROM epg_sync_runs ORDER BY started_at DESC LIMIT 5`);
  console.log(JSON.stringify(runs));
  const {EpgDemand}=await import('../src/services/epg/demand.js');
  console.log(JSON.stringify({countriesToSync:await new EpgDemand().countries()}));
  if(process.argv.includes('--source')) {
    const {IptvOrgProvider}=await import('../src/services/epg/directory.js');
    const data=await new IptvOrgProvider('RO').load();
    const future=data.programs.filter(p=>+p.endAt>Date.now());
    console.log(JSON.stringify({liveSource:true,channels:data.channels.length,programmes:data.programs.length,future:future.length,latest:future.length?new Date(Math.max(...future.map(p=>+p.endAt))).toISOString():null}));
  }
}catch {console.error('EPG_COVERAGE_FAILED: details withheld');process.exitCode=1;}
finally {await closeDatabase();}
