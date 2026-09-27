import { describe, expect, it } from "vitest";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { bestEpgMatch, scoreEpgCandidate } from "../src/services/epg/matcher.js";
import { normalizeEpgTitle, parseXmlTv, parseXmlTvTimestamp } from "../src/services/epg/xmltv.js";

describe("XMLTV normalization and matching", () => {
  it("converts XMLTV offsets to UTC", () => {
    expect(parseXmlTvTimestamp("20260926200000 +0300").toISOString()).toBe("2026-09-26T17:00:00.000Z");
  });

  it("parses channels and normalized programmes", () => {
    const parsed = parseXmlTv(`<tv><channel id="c"><display-name lang="ro">Canal</display-name></channel><programme start="20260926200000 +0300" stop="20260926210000 +0300" channel="c"><title lang="ro">Sosire HD</title><category>Movie</category><date>2016</date></programme></tv>`);
    expect(parsed.channels[0]?.displayName).toBe("Canal");
    expect(parsed.programs[0]?.year).toBe(2016);
    expect(normalizeEpgTitle(parsed.programs[0]!.title)).toBe("sosire");
  });

  it("accepts confident title/year matches and rejects weak ones", () => {
    const program = { sourceProgramId: "x", channelExternalId: "c", title: "Interstellar HD", subtitle: null, description: "space time family", startAt: new Date(), endAt: new Date(Date.now() + 1000), category: "Movie", language: "ro", year: 2014 };
    expect(bestEpgMatch(program, fixtureCatalog)?.tmdbId).toBe(157336);
    expect(scoreEpgCandidate({ ...program, title: "Completely unrelated", year: 1992 }, fixtureCatalog[0]!)).toBeNull();
  });
});
