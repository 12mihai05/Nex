import { gzipSync } from "node:zlib";
import { describe,expect,it } from "vitest";
import { decodeXmlTv,isPublicAddress } from "../src/services/epg/download.js";
import { selectCountryChannels,epgShareCountryFiles } from "../src/services/epg/directory.js";
import { parseXmlTv } from "../src/services/epg/xmltv.js";

describe("global EPG boundaries",()=>{
  it("discovers country feeds without inventing URLs and maps GB to UK",()=>{expect(epgShareCountryFiles('<a href="epg_ripper_UK1.xml.gz">UK</a><a href="epg_ripper_RO1.xml.gz">RO</a>',"GB")).toEqual(["https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz"]);});
  it("handles gzip and rejects oversized output",()=>{
    const raw=gzipSync(Buffer.from('<tv><channel id="x"><display-name>X</display-name></channel></tv>'));
    expect(parseXmlTv(decodeXmlTv(raw)).channels[0]?.displayName).toBe("X"); expect(()=>decodeXmlTv(raw,5)).toThrow();
  });
  it("allows the standard DTD declaration without fetching it and rejects entities",()=>{
    expect(parseXmlTv('<!DOCTYPE tv SYSTEM "xmltv.dtd"><tv generator-info-name="test"></tv>').programs).toEqual([]);
    expect(()=>parseXmlTv('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///etc/passwd">]><tv>&x;</tv>')).toThrow();
  });
  it("country selection excludes adult channels and includes regional feeds",()=>{
    const selected=selectCountryChannels([{id:"a",name:"A",country:"RO"},{id:"b",name:"B",country:"BG"},{id:"c",name:"C",country:"RO",is_nsfw:true},{id:"d",name:"D",country:"US"}],"RO",new Set(["d"]));
    expect(selected.map((c)=>c.id)).toEqual(["a","d"]);
  });
  it("blocks private and mapped addresses",()=>{for(const ip of ["127.0.0.1","10.1.1.1","169.254.169.254","::1","::ffff:127.0.0.1","fd00::1"]) expect(isPublicAddress(ip)).toBe(false);});
});
