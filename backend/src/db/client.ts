import { createRequire } from "node:module";
import { createClient, type Client } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getConfig } from "../config.js";
import * as schema from "./schema.js";

export type NexDatabase = LibSQLDatabase<typeof schema>;

let client: Client | undefined;
let database: NexDatabase | undefined;

export function getDatabase(): NexDatabase {
  if (!database) {
    const config = getConfig();
    const local = config.TURSO_DATABASE_URL.startsWith("file:") || config.TURSO_DATABASE_URL === ":memory:";
    if (local && process.env.VERCEL === "1") throw new Error("REMOTE_DATABASE_REQUIRED");
    // Load native SQLite only for local development. Remote Turso must not
    // import the native libSQL binding during a serverless cold start.
    const factory: typeof createClient = local
      ? (createRequire(import.meta.url)("@libsql/client") as { createClient: typeof createClient }).createClient
      : createClient;
    client = factory({
      url: config.TURSO_DATABASE_URL,
      ...(config.TURSO_AUTH_TOKEN ? { authToken: config.TURSO_AUTH_TOKEN } : {}),
    });
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  client?.close();
  client = undefined;
  database = undefined;
}
