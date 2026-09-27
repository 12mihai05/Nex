import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cwd = fileURLToPath(new URL("../", import.meta.url));
function run(script: string, url: string, vercel = "") {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, VITEST: "true", NODE_ENV: "test", VERCEL: vercel,
      TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "", OPENAI_API_KEY: "", TMDB_READ_ACCESS_TOKEN: "",
      BETTER_AUTH_URL: "http://localhost:8787", BETTER_AUTH_SECRET: "runtime-test-secret-with-at-least-32-characters",
      NEX_INVITE_CODE: "test-invite", EPG_SYNC_SECRET: "test-sync-secret", EPG_SOURCE_TYPE: "fixture" },
  });
}

it("serves health on remote Turso without loading native SQLite", () => {
  const result = run(`
    import Module from "node:module";
    const originalLoad = Module._load;
    Module._load = function(id, ...args) {
      if (id === "libsql" || id.startsWith("@libsql/linux") || id === "@libsql/client")
        throw new Error("NATIVE_SQLITE_LOADED");
      return originalLoad.call(this, id, ...args);
    };
    const { default: app } = await import("./src/app.ts");
    const response = await app.request("http://localhost/api/health");
    const body = await response.json();
    if (response.status !== 200 || body.status !== "ok" || body.integrations.database !== "turso")
      throw new Error("HEALTH_CHECK_FAILED");
    await (await import("./src/db/client.ts")).closeDatabase();
  `, "libsql://runtime-test.invalid", "1");
  expect(result.stderr).not.toContain("NATIVE_SQLITE_LOADED");
  expect(result.status).toBe(0);
}, 30_000);

it("still supports local in-memory SQLite", () => {
  const result = run(`
    const { getDatabase, closeDatabase } = await import("./src/db/client.ts");
    const { sql } = await import("drizzle-orm");
    await getDatabase().run(sql.raw("SELECT 1"));
    await closeDatabase();
  `, ":memory:");
  expect(result.status).toBe(0);
}, 30_000);

it("rejects local database configuration on Vercel before loading SQLite", () => {
  const result = run(`
    const { getDatabase } = await import("./src/db/client.ts");
    try { getDatabase(); process.exitCode = 1; }
    catch (error) { if (error.message !== "REMOTE_DATABASE_REQUIRED") process.exitCode = 1; }
  `, "file:./local.db", "1");
  expect(result.status).toBe(0);
}, 30_000);
