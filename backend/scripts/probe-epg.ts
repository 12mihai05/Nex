import { decodeXmlTv, downloadPublic } from "../src/services/epg/download.js";
import { parseXmlTv } from "../src/services/epg/xmltv.js";

const sources = [
  ["EPGShare01 Romania", "https://epgshare01.online/epgshare01/epg_ripper_RO1.xml.gz"],
  ["EPGShare01 France", "https://epgshare01.online/epgshare01/epg_ripper_FR1.xml.gz"],
  ["EPGShare01 Bulgaria", "https://epgshare01.online/epgshare01/epg_ripper_BG1.xml.gz"],
  ["IPTV-EPG Romania", "https://iptv-epg.org/files/epg-ro.xml"],
  ["EPG.pw Romania", "https://epg.pw/xmltv/epg_RO.xml.gz"],
];
await Promise.all(sources.map(async ([name, url]) => {
  try {
    const bytes = await downloadPublic(url!); const parsed = parseXmlTv(decodeXmlTv(bytes));
    const now = Date.now(); const live = parsed.programs.filter((p) => +p.startAt <= now && +p.endAt > now);
    const starts = parsed.programs.map((p) => +p.startAt); const ends = parsed.programs.map((p) => +p.endAt);
    console.log(JSON.stringify({ name, bytes: bytes.length, channels: parsed.channels.length, programs: parsed.programs.length, live: live.length, first: starts.length ? new Date(starts.reduce((a,b)=>Math.min(a,b),Infinity)).toISOString() : null, last: ends.length ? new Date(ends.reduce((a,b)=>Math.max(a,b),0)).toISOString() : null, coreChannels: parsed.channels.filter((c) => /pro.?tv|antena.?1|tvr.?1|digi.?24|digi.?sport/i.test(c.displayName)).map((c) => c.displayName) }));
  } catch (error) { console.log(JSON.stringify({ name, status: "failed", code: error instanceof Error && /^EPG_[A-Z_]+$/.test(error.message) ? error.message : error instanceof Error ? error.name : "PARSE_OR_NETWORK_FAILURE" })); }
}));
