import "../src/env.js";
import {downloadPublic,decodeXmlTv} from "../src/services/epg/download.js";
import {parseXmlTv} from "../src/services/epg/xmltv.js";
import {epgShareCountryFiles} from "../src/services/epg/directory.js";

// Public upstream-only diagnostic: no database writes or credential output.
const normalize=(name:string)=>name.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/\b(?:hd|sd|uhd|4k)\b/g,"").replace(/[^a-z0-9]/g,"");
try {
  const index=Buffer.from(await downloadPublic("https://epgshare01.online/epgshare01/")).toString("utf8");
  console.log(JSON.stringify({discoveredRomanianFiles:epgShareCountryFiles(index,"RO")}));
  const feeds=[];
  for(const source of ["RO1","RO2"]){
    const bytes=await downloadPublic(`https://epgshare01.online/epgshare01/epg_ripper_${source}.xml.gz`);
    const parsed=parseXmlTv(decodeXmlTv(bytes));feeds.push({source,...parsed});
    const now=new Date();
    console.log(JSON.stringify({source,bytes:bytes.length,channels:parsed.channels.length,programmes:parsed.programs.length,current:parsed.programs.filter(p=>p.startAt<=now&&p.endAt>now).length,first:new Date(Math.min(...parsed.programs.map(p=>+p.startAt))).toISOString(),last:new Date(Math.max(...parsed.programs.map(p=>+p.endAt))).toISOString()}));
  }
  const primaryNames=new Set(feeds[0]!.channels.map(c=>normalize(c.displayName)));
  const secondary=feeds[1]!.channels;
  console.log(JSON.stringify({secondaryNameOverlap:secondary.filter(c=>primaryNames.has(normalize(c.displayName))).length,secondaryUnmatchedNames:secondary.filter(c=>!primaryNames.has(normalize(c.displayName))).map(c=>c.displayName),note:"Name normalization is a diagnostic, not proof that regional schedules are identical."}));
}catch {console.error("EPG_COMPARISON_FAILED: details suppressed");process.exitCode=1;}
