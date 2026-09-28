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

it("renews a signed device session and invalidates it on logout", () => {
  const result = run(`
    import assert from "node:assert/strict";
    const { getDatabase, closeDatabase } = await import("./src/db/client.ts");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const { session } = await import("./src/db/schema.ts");
    const db = getDatabase();
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { auth } = await import("./src/auth.ts");
    const { default: app } = await import("./src/app.ts");
    assert.equal((await app.request("http://localhost:8787/api/discovery")).status, 401);
    assert.equal((await app.request("http://localhost:8787/api/catalog?mediaType=movie")).status, 401);
    assert.equal((await app.request("http://localhost:8787/api/providers?country=FR")).status, 401);
    const request = (path, method = "GET", headers = {}, body) => auth.handler(new Request(
      "http://localhost:8787/api/auth/" + path,
      { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }
    ));
    const signup = await request("sign-up/email", "POST", {}, {
      name: "Session test", email: "session@example.test", password: "test-only-password-12345"
    });
    assert.equal(signup.status, 200);
    const token = signup.headers.get("set-auth-token");
    assert.ok(token);
    const headers = { Authorization: "Bearer " + token };
    assert.equal((await app.request("http://localhost:8787/api/catalog?mediaType=series&minMinutes=20", {headers})).status, 400);
    const catalog = await app.request("http://localhost:8787/api/catalog?mediaType=movie&minMinutes=70&maxMinutes=90", {headers});
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get("cache-control"), "private, no-store");
    assert.ok((await catalog.json()).data.every(i => i.mediaType === "movie" && i.runtimeMinutes >= 70 && i.runtimeMinutes <= 90));
    const settings = await app.request("http://localhost:8787/api/me/settings", { headers });
    const favoritesSearch = await app.request("http://localhost:8787/api/search?q=Arrival&mode=onboarding", {headers});
    assert.equal(favoritesSearch.status, 200);
    assert.ok((await favoritesSearch.json()).data.every(i => i.metadataOnly === true));
    assert.equal((await settings.json()).data.user.name, "Session test");
    const initial = (await db.select().from(session))[0];
    assert.ok(initial.expiresAt.getTime() - Date.now() > 364 * 86400000);
    // Simulate an active device coming back after the refresh interval.
    await db.update(session).set({
      expiresAt: new Date(Date.now() + 360 * 86400000),
      updatedAt: new Date(Date.now() - 5 * 86400000)
    });
    const restored = await request("get-session", "GET", headers);
    assert.ok((await restored.json()).user);
    const renewed = (await db.select().from(session))[0];
    assert.ok(renewed.expiresAt.getTime() - Date.now() > 364 * 86400000);
    const logout = await request("sign-out", "POST", headers, {});
    assert.equal(logout.status, 200);
    assert.equal(await (await request("get-session", "GET", headers)).json(), null);
    const login = await request("sign-in/email", "POST", {}, { email: "session@example.test", password: "test-only-password-12345" });
    assert.equal(login.status, 200);
    const deletionHeaders = { Authorization: "Bearer " + login.headers.get("set-auth-token") };
    await db.update(session).set({ createdAt: new Date(Date.now() - 2 * 86400000) });
    assert.equal((await request("delete-user", "POST", deletionHeaders, {})).status, 400);
    assert.equal((await request("delete-user", "POST", deletionHeaders, { password: "incorrect-test-password" })).status, 400);
    assert.ok((await (await request("get-session", "GET", deletionHeaders)).json()).user);
    assert.equal((await request("delete-user", "POST", deletionHeaders, { password: "test-only-password-12345" })).status, 200);
    assert.equal(await (await request("get-session", "GET", deletionHeaders)).json(), null);
    await closeDatabase();
  `, ":memory:");
  // Never dump auth responses or tokens on failure.
  expect(result.status, "Device session renewal/revocation subprocess failed").toBe(0);
}, 30_000);
