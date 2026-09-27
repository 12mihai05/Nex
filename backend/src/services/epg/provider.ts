import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getConfig } from "../../config.js";
import { parseXmlTv, type ParsedXmlTv } from "./xmltv.js";
import { decodeXmlTv, downloadPublic } from "./download.js";
import { IptvOrgProvider } from "./directory.js";

export interface EpgProvider {
  readonly sourceId: string;
  readonly country?: string;
  load(options?:{preferredExternalIds:Set<string>}): Promise<ParsedXmlTv>;
}

export class XmlTvTextProvider implements EpgProvider {
  constructor(public readonly sourceId: string, private readonly loadText: () => Promise<string>) {}
  async load(): Promise<ParsedXmlTv> { return parseXmlTv(await this.loadText()); }
}

export function createEpgProvider(country = "RO"): EpgProvider {
  const config = getConfig();
  if (config.EPG_SOURCE_TYPE === "iptv-org" || config.EPG_SOURCE_TYPE === "iptv_org") return new IptvOrgProvider(country);
  if (config.EPG_SOURCE_TYPE === "xmltv" && config.EPG_XMLTV_URL) {
    return new XmlTvTextProvider("xmltv-url", async () => {
      return decodeXmlTv(await downloadPublic(config.EPG_XMLTV_URL!));
    });
  }
  if (config.EPG_SOURCE_TYPE === "xmltv" && config.EPG_XMLTV_PATH) {
    return new XmlTvTextProvider(`xmltv-file:${country}`, async () => decodeXmlTv(await readFile(config.EPG_XMLTV_PATH!)));
  }
  if (config.EPG_SOURCE_TYPE === "xmltv") throw new Error("EPG_SOURCE_NOT_CONFIGURED");
  const fixturePath = fileURLToPath(new URL("../../fixtures/epg.xml", import.meta.url));
  return new XmlTvTextProvider("fixture", () => readFile(fixturePath, "utf8"));
}
