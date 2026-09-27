import { gunzipSync } from "node:zlib";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getConfig } from "../../config.js";

export function isPublicAddress(address: string): boolean {
  if (address.includes(":")) return !/^(::|fc|fd|fe[89ab])/i.test(address);
  const [a = 0, b = 0] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

export function decodeXmlTv(bytes: Uint8Array, maxBytes = getConfig().EPG_MAX_DOWNLOAD_BYTES): string {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: maxBytes }) : Buffer.from(bytes);
  if (raw.length > maxBytes) throw new Error("EPG_DOCUMENT_TOO_LARGE");
  return raw.toString("utf8");
}

// No user-provided URLs enter this function; directories are still untrusted.
export async function downloadPublic(urlValue: string): Promise<Uint8Array> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("EPG_UNSAFE_URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("EPG_UNSAFE_URL");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error("EPG_DOWNLOAD_FAILED");
  const max = getConfig().EPG_MAX_DOWNLOAD_BYTES;
  if (Number(response.headers.get("content-length")) > max) throw new Error("EPG_DOCUMENT_TOO_LARGE");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > max) throw new Error("EPG_DOCUMENT_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
