import { downloadPublic,decodeXmlTv } from "../src/services/epg/download.js";
import { epgShareCountryFiles } from "../src/services/epg/directory.js";
import { parseXmlTv } from "../src/services/epg/xmltv.js";
const index=Buffer.from(await downloadPublic("https://epgshare01.online/epgshare01/")).toString("utf8");
for(const country of ["GB","ES","FR","CH","IT","DE","MD"]) {
  const urls=epgShareCountryFiles(index,country);
  console.log(JSON.stringify({country,availableFiles:urls}));
  if(!urls[0]) continue;
  try {
    const bytes=await downloadPublic(urls[0]);
    const xml=decodeXmlTv(bytes,100_000_000); const parsed=parseXmlTv(xml); const now=Date.now();
    console.log(JSON.stringify({country,status:"pass",compressedBytes:bytes.length,xmlBytes:Buffer.byteLength(xml),channels:parsed.channels.length,programs:parsed.programs.length,live:parsed.programs.filter(p=>+p.startAt<=now&&+p.endAt>now).length,last:new Date(parsed.programs.reduce((last,p)=>Math.max(last,+p.endAt),0)).toISOString(),sampleChannels:parsed.channels.slice(0,8).map(c=>c.displayName)}));
  } catch(error) {console.log(JSON.stringify({country,status:"failed",code:error instanceof Error&&/^EPG_[A-Z_]+$/.test(error.message)?error.message:error instanceof Error?error.name:"FAILED"}));}
}
