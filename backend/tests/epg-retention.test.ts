import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema.js";
import { FixtureTmdbRepository } from "../src/repositories/tmdb-repository.js";
import type { EpgProvider } from "../src/services/epg/provider.js";
import { EpgService } from "../src/services/epg/service.js";

describe("EPG sync retention and matching", () => {
  let client: ReturnType<typeof createClient>;
  const now = new Date("2026-09-26T12:00:00.000Z");

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const migrationName of (await readdir(fileURLToPath(new URL("../drizzle/",import.meta.url)))).filter((n)=>n.endsWith(".sql")).sort()) {
      const migration = await readFile(fileURLToPath(new URL(`../drizzle/${migrationName}`, import.meta.url)), "utf8");
      await client.executeMultiple(migration.replaceAll("--> statement-breakpoint", ""));
    }
  });

  afterEach(() => client.close());

  it('rolls back the whole country snapshot if any program write fails',async()=>{
    const db=drizzle(client,{schema});
    await db.insert(schema.channels).values({id:'test:old',sourceId:'test',externalId:'old',displayName:'Old',country:'RO'});
    await db.insert(schema.epgPrograms).values({id:'old',sourceId:'test',sourceProgramId:'old',channelId:'test:old',title:'Previous schedule',startAt:now,endAt:new Date(+now+3600000),updatedAt:new Date(+now-1000)});
    await client.execute("CREATE TRIGGER reject_program BEFORE INSERT ON epg_programs WHEN NEW.title='Reject me' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const provider:EpgProvider={sourceId:'test',async load(){return {channels:[{externalId:'new',displayName:'New',logoUrl:null,language:null}],programs:[{sourceProgramId:'new',channelExternalId:'new',title:'Reject me',subtitle:null,description:null,startAt:now,endAt:new Date(+now+3600000),category:null,language:null,year:null}],sourceTimestamp:null};}};
    await expect(new EpgService(db,provider,new FixtureTmdbRepository()).sync(now)).rejects.toThrow();
    expect((await db.select().from(schema.channels)).map(c=>[c.id,c.active])).toEqual([['test:old',true]]);
    expect((await db.select().from(schema.epgPrograms)).map(p=>p.title)).toEqual(['Previous schedule']);
    expect((await db.select().from(schema.epgSyncRuns))[0]?.status).toBe('failed');
  });
  it("removes out-of-window rows and stores a confident TMDB association", async () => {
    const db = drizzle(client, { schema });
    const program = (id: string, startAt: Date, title: string) => ({ sourceProgramId: id, channelExternalId: "c1", title, subtitle: null, description: "A linguist communicates with mysterious visitors.", startAt, endAt: new Date(startAt.getTime() + 7_200_000), category: "Movie", language: "en", year: title === "Arrival" ? 2016 : null });
    const provider: EpgProvider = {
      sourceId: "test",
      async load() {
        return {
          channels: [{ externalId: "c1", displayName: "Test TV", logoUrl: null, language: "ro" }],
          programs: [
            program("old", new Date(now.getTime() - 9 * 86_400_000), "Old programme"),
            program("current", new Date(now.getTime() + 3_600_000), "Arrival"),
            program("future", new Date(now.getTime() + 16 * 86_400_000), "Future programme"),
          ],
          sourceTimestamp: null,
        };
      },
    };
    const result = await new EpgService(db, provider, new FixtureTmdbRepository()).sync(now);
    expect(result).toMatchObject({ importedRows: 1, deletedRows: 0 });
    const rows = await db.select().from(schema.epgPrograms);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Arrival", matchedTmdbId: 329865, matchedMediaType: "movie" });
    expect(rows[0]!.matchConfidence).toBeGreaterThanOrEqual(0.72);
  });
});
