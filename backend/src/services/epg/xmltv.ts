import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";

export interface NormalizedChannel {
  externalId: string;
  displayName: string;
  logoUrl: string | null;
  language: string | null;
  country?: string;
  canonicalId?: string | null;
}

export interface NormalizedProgram {
  sourceProgramId: string;
  channelExternalId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  startAt: Date;
  endAt: Date;
  category: string | null;
  language: string | null;
  year: number | null;
}

export interface ParsedXmlTv {
  channels: NormalizedChannel[];
  programs: NormalizedProgram[];
  sourceTimestamp: Date | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text": unknown })["#text"]);
  return null;
}

export function parseXmlTvTimestamp(raw: string): Date {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])(\d{2})(\d{2})$/);
  if (!match) throw new Error(`Invalid XMLTV timestamp format`);
  const [, year, month, day, hour, minute, second = "00", sign, offsetHour, offsetMinute] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offset = (Number(offsetHour) * 60 + Number(offsetMinute)) * 60_000 * (sign === "+" ? 1 : -1);
  const date = new Date(utc - offset);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid XMLTV timestamp value");
  return date;
}

export function parseXmlTv(xml: string): ParsedXmlTv {
  // Standard XMLTV external DTD declarations are common. Never fetch a DTD,
  // and reject internal subsets/entities before handing the document to the parser.
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml)) throw new Error("EPG_UNSAFE_XML");
  xml = xml.replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = parser.parse(xml)?.tv;
  if (!root || typeof root !== "object") throw new Error("Invalid XMLTV document");
  const channels = array<any>(root.channel).map((entry) => {
    const names = array<any>(entry["display-name"]);
    const primary = names[0];
    return {
      externalId: String(entry["@_id"]),
      displayName: text(primary) ?? String(entry["@_id"]),
      logoUrl: typeof entry.icon?.["@_src"] === "string" ? entry.icon["@_src"] : null,
      language: typeof primary?.["@_lang"] === "string" ? primary["@_lang"] : null,
    } satisfies NormalizedChannel;
  }).filter((entry) => entry.externalId && entry.displayName);

  const programs = array<any>(root.programme).map((entry) => {
    try {
    const startAt = parseXmlTvTimestamp(String(entry["@_start"]));
    const endAt = parseXmlTvTimestamp(String(entry["@_stop"]));
    const titleNode = array<any>(entry.title)[0];
    const title = text(titleNode);
    const channelExternalId = String(entry["@_channel"] ?? "");
    if (!title || !channelExternalId || endAt <= startAt) return null;
    const yearText = text(entry.date);
    const identity = `${channelExternalId}|${startAt.toISOString()}|${endAt.toISOString()}|${title}`;
    return {
      sourceProgramId: createHash("sha256").update(identity).digest("hex").slice(0, 32),
      channelExternalId,
      title,
      subtitle: text(entry["sub-title"]),
      description: text(entry.desc),
      startAt,
      endAt,
      category: text(array<any>(entry.category)[0]),
      language: typeof titleNode?.["@_lang"] === "string" ? titleNode["@_lang"] : null,
      year: yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null,
    } satisfies NormalizedProgram;
    } catch { return null; }
  }).filter((entry): entry is NormalizedProgram => entry !== null);

  const sourceDate = typeof root["@_date"] === "string" ? new Date(root["@_date"]) : null;
  return { channels, programs, sourceTimestamp: sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate : null };
}

export function normalizeEpgTitle(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(hd|uhd|4k|premiera|premiere)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
