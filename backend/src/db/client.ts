import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getConfig } from "../config.js";
import * as schema from "./schema.js";

export type NexDatabase = LibSQLDatabase<typeof schema>;

let client: Client | undefined;
let database: NexDatabase | undefined;

export function getDatabase(): NexDatabase {
  if (!database) {
    const config = getConfig();
    client = createClient({
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
