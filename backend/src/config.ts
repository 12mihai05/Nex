import "./env.js";
import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BETTER_AUTH_SECRET: z.string().min(32).default("nex-local-development-secret-change-me"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8787"),
  NEX_INVITE_CODE: z.string().min(6).default("nex-local-invite"),
  TURSO_DATABASE_URL: z.string().default("file:./local.db"),
  TURSO_AUTH_TOKEN: z.string().optional(),
  TMDB_READ_ACCESS_TOKEN: z.string().optional(),
  TMDB_METADATA_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  TMDB_AVAILABILITY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_CHAT_MODEL: z.string().optional(),
  AI_DAILY_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  EPG_SOURCE_TYPE: z.enum(["fixture", "xmltv", "iptv-org", "iptv_org"]).default("fixture"),
  IPTV_ORG_API_BASE: z.string().url().default("https://iptv-org.github.io/api"),
  EPG_COUNTRIES: z.string().default("RO,BG,GB,ES,FR,CH,IT,DE,MD"),
  EPG_COUNTRY_SOURCES_JSON: z.string().default('{}'),
  EPG_MAX_FEEDS_PER_COUNTRY: z.coerce.number().int().min(1).max(20).default(3),
  EPG_MAX_CHANNELS_PER_COUNTRY: z.coerce.number().int().min(1).max(1000).default(60),
  EPG_MAX_DOWNLOAD_BYTES: z.coerce.number().int().positive().max(100_000_000).default(75_000_000),
  EPG_MAX_MATCHES_PER_SYNC: z.coerce.number().int().min(0).max(50).default(5),
  EPG_XMLTV_URL: optionalUrl,
  EPG_XMLTV_PATH: z.string().optional(),
  EPG_SYNC_SECRET: z.string().min(12).default("nex-local-sync-secret"),
  EPG_RETENTION_PAST_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  EPG_RETENTION_FUTURE_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

export function getConfig(overrides: Record<string, string | undefined> = process.env): AppConfig {
  if (!cached || overrides !== process.env) cached = envSchema.parse(overrides);
  if (cached.NODE_ENV === "production" && [cached.BETTER_AUTH_SECRET,cached.NEX_INVITE_CODE,cached.EPG_SYNC_SECRET].some((v)=>/replace-with|nex-local|your-own/.test(v))) throw new Error("PRODUCTION_SECRETS_REQUIRED");
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
