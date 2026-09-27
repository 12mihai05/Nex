import { downloadPublic,decodeXmlTv } from "../src/services/epg/download.js";
import { getDirectory,selectCountryChannels } from "../src/services/epg/directory.js";
import { parseXmlTv } from "../src/services/epg/xmltv.js";
const directory=await getDirectory();
const md=selectCountryChannels(directory.channels,"MD",new Set(directory.feeds.filter(f=>f.broadcast_area.includes("c/MD")).map(f=>f.channel)));
console.log(JSON.stringify({moldovaDirectory:md.map(c=>({id:c.id,name:c.name}))}));
const parsed=parseXmlTv(decodeXmlTv(await downloadPublic("https://epgshare01.online/epgshare01/epg_ripper_RO1.xml.gz")));
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
const names=new Set(md.map(c=>normalize(c.name)));
const channels=parsed.channels.filter(c=>names.has(normalize(c.displayName))||/moldova|chisinau|jurnal|tv8|prime|protv/i.test(c.displayName));
console.log(JSON.stringify({source:"RO shared feed",channels:channels.map(c=>({id:c.externalId,name:c.displayName,programs:parsed.programs.filter(p=>p.channelExternalId===c.externalId).length}))}));
for(const url of ["https://dearbulut.github.io/iptv/epg/md.xml.gz","https://iptvx.one/epg/epg.xml.gz"]) {
  try {
    const guide=parseXmlTv(decodeXmlTv(await downloadPublic(url),75_000_000));
    console.log(JSON.stringify({url,channels:guide.channels.length,programs:guide.programs.length,live:guide.programs.filter(p=>+p.startAt<=Date.now()&&+p.endAt>Date.now()).length,last:new Date(guide.programs.reduce((v,p)=>Math.max(v,+p.endAt),0)).toISOString(),names:guide.channels.filter(c=>names.has(normalize(c.displayName))||/moldova|chisinau|jurnal|tv8/i.test(c.displayName)).map(c=>c.displayName)}));
  } catch(error) {console.log(JSON.stringify({url,status:"failed",code:error instanceof Error&&/^EPG_[A-Z_]+$/.test(error.message)?error.message:error instanceof Error?error.name:"FAILED"}));}
}
