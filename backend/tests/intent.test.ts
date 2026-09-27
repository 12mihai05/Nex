import { describe, expect, it } from "vitest";
import { detectSearchIntent, isPersistentPreference } from "../src/services/intent.js";

describe("search and chat intent scoping", () => {
  it("uses all providers for exact lookup", () => {
    const result = detectSearchIntent("Interstellar");
    expect(result.intent).toBe("TITLE_LOOKUP");
    expect(result.availabilityScope).toBe("all_providers");
  });

  it("uses owned services for generic discovery", () => {
    const result = detectSearchIntent("good horror on Netflix under 2 hours");
    expect(result.intent).toBe("DISCOVERY");
    expect(result.availabilityScope).toBe("owned_services");
    expect(result.providerIds).toContain(8);
    expect(result.maxRuntimeMinutes).toBe(120);
  });

  it("honors an explicit all-provider override", () => {
    expect(detectSearchIntent("anything good even if I don't subscribe").availabilityScope).toBe("all_providers");
  });

  it("separates durable preference language from tonight context", () => {
    expect(isPersistentPreference("I generally hate musicals")).toBe(true);
    expect(isPersistentPreference("I don't want musicals tonight")).toBe(false);
  });
});
