import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "node:url";
import { getDatabase, closeDatabase } from "../src/db/client.js";

try {
  const before = await getDatabase().run("SELECT count(*) FROM sqlite_master WHERE type = 'table'");
  void before;
  await migrate(getDatabase(), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Nex database migrations applied; existing rows preserved.");
} catch (error) {
  const e = error as { name?: string; code?: string; cause?: { code?: string; name?: string; message?: string } };
  let detail = e.cause?.message ?? "";
  for (const [key,value] of Object.entries(process.env)) if (/TOKEN|SECRET|KEY|DATABASE_URL|INVITE/.test(key) && value) detail = detail.replaceAll(value,"[redacted]");
  detail = detail.replace(/(?:https?|libsql):\/\/\S+/g,"[redacted-url]");
  console.error(JSON.stringify({ status: "migration_failed", name: e.name, code: e.code, causeCode: e.cause?.code, detail: detail.slice(0,600) }));
  process.exitCode = 1;
} finally { await closeDatabase(); }
