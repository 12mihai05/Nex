import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native Hono deployment configuration", () => {
  it("preserves API paths without a catch-all rewrite or legacy adapter", () => {
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    expect(config.framework).toBe("hono");
    expect(config.rewrites).toBeUndefined();
    expect(config.routes).toBeUndefined();
    expect(config.functions).toEqual({ "src/app.ts": { maxDuration: 120 } });
    expect(existsSync(new URL("../api/index.ts", import.meta.url))).toBe(false);
    const entry = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
    expect(entry).toContain("export default app;");
    expect(entry).toContain('app.get("/api/health"');
  });
});
