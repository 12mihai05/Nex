import '../src/env.js';
import {XMLParser} from 'fast-xml-parser';
import {sql} from 'drizzle-orm';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {getConfig} from '../src/config.js';
import {downloadPublic,decodeXmlTv} from '../src/services/epg/download.js';
import {parseXmlTv} from '../src/services/epg/xmltv.js';
import {createEpgProvider} from '../src/services/epg/provider.js';

// Read-only audit. Never emit credentials, private profiles or raw provider errors.
try {
  const config=getConfig();
  console.log(JSON.stringify({source:config.EPG_SOURCE_TYPE,channelLimit:'none',feedLimit:config.EPG_MAX_FEEDS_PER_COUNTRY,countries:config.EPG_COUNTRIES}));
  const now=Date.now();
  const db=getDatabase();
  console.log(JSON.stringify({accountCountries:await db.all(sql`select country,count(*) accounts from profiles group by country`)}));
  console.log(JSON.stringify({database:await db.all(sql`select c.country,count(distinct c.id) channels,count(distinct case when c.active=1 then c.id end) active_channels,count(p.id) programmes,count(distinct case when p.start_at<=${now} and p.end_at>${now} then c.id end) live_channels,count(distinct case when p.end_at>${now} then c.id end) future_channels,max(p.end_at) last_end from channels c left join epg_programs p on p.channel_id=c.id group by c.country`)}));
  console.log(JSON.stringify({recentSyncs:await db.all(sql`select source_id,status,error_code,imported_rows,started_at from epg_sync_runs order by started_at desc limit 12`)}));
  const expected=await createEpgProvider('RO').load();
  const saved=await db.all<{source_program_id:string}>(sql`select source_program_id from epg_programs where source_id='iptv-org:RO'`);
  const savedIds=new Set(saved.map(r=>r.source_program_id));
  const retained=expected.programs.filter(p=>+p.endAt>=now-config.EPG_RETENTION_PAST_DAYS*86400000&&+p.startAt<=now+config.EPG_RETENTION_FUTURE_DAYS*86400000);
  console.log(JSON.stringify({parity:{country:'RO',expected:retained.length,missing:retained.filter(p=>!savedIds.has(p.sourceProgramId)).length,eligibleChannels:expected.channels.length},storagePages:await db.all(sql`pragma page_count`),pageSize:await db.all(sql`pragma page_size`)}));
  for(const name of ['RO1','RO2']){
    const bytes=await downloadPublic(`https://epgshare01.online/epgshare01/epg_ripper_${name}.xml.gz`),xml=decodeXmlTv(bytes);
    const raw=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(xml).tv;
    const list=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
    const entries=list(raw.programme),parsed=parseXmlTv(xml);
    const ids=new Set(parsed.channels.map(c=>c.externalId));
    const live=new Set(parsed.programs.filter(p=>+p.startAt<=now&&+p.endAt>now).map(p=>p.channelExternalId));
    const upcoming=new Set(parsed.programs.filter(p=>+p.endAt>now).map(p=>p.channelExternalId));
    const fields=['desc','sub-title','category','date','credits','episode-num'];
    console.log(JSON.stringify({feed:name,rawProgrammes:entries.length,parsedProgrammes:parsed.programs.length,channels:parsed.channels.length,liveChannels:live.size,futureChannels:upcoming.size,orphanProgrammes:parsed.programs.filter(p=>!ids.has(p.channelExternalId)).length,fields:Object.fromEntries(fields.map(f=>[f,entries.filter(p=>p[f]!==undefined).length])),multipleDescriptions:entries.filter(p=>Array.isArray(p.desc)).length,missingStop:entries.filter(p=>!p['@_stop']).length,noFutureChannels:parsed.channels.filter(c=>!upcoming.has(c.externalId)).map(c=>c.displayName),upcomingChannels:name==='RO2'?parsed.channels.filter(c=>upcoming.has(c.externalId)).map(c=>c.displayName):undefined}));
  }
}catch{console.error('EPG_AUDIT_FAILED (provider/credential details suppressed)');process.exitCode=1;}
finally{await closeDatabase();}
