import { describe, expect, it } from "vitest";
import { chatBlockSchema } from "../src/domain/types.js";
import { reminderBodySchema } from "../src/http/schemas.js";
import { calculateReminderTime } from "../src/services/reminder.js";
import { resolveDisplayedReference } from "../src/services/reference-resolution.js";

describe("chat protocol, references and reminders", () => {
  const displayed = [
    { position: 1, externalId: "11", contentType: "movie" },
    { position: 2, externalId: "22", contentType: "series" },
    { position: 3, externalId: "33", contentType: "movie" },
  ];

  it("resolves explicit carousel ordinals without model memory", () => {
    expect(resolveDisplayedReference("add the second one", displayed)?.externalId).toBe("22");
    expect(resolveDisplayedReference("I like #3", displayed)?.externalId).toBe("33");
  });

  it("calculates local reminder instants", () => {
    const start = new Date("2026-09-26T18:00:00.000Z");
    expect(calculateReminderTime(start, 10).toISOString()).toBe("2026-09-26T17:50:00.000Z");
    expect(() => calculateReminderTime(start, -1)).toThrow();
  });

  it("rejects arbitrary chat UI blocks and invalid reminder offsets", () => {
    expect(chatBlockSchema.safeParse({ type: "arbitrary_widget", code: "evil" }).success).toBe(false);
    expect(reminderBodySchema.safeParse({ epgProgramId: "p", offsetMinutes: -3 }).success).toBe(false);
  });
});
