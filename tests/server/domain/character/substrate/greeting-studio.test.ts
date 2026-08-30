// domain/character/substrate/greeting-studio — pins: composeGreetingSteer's catalog-order join ahead of
// the host's own free text (no picks ⇒ verbatim free text), and buildGreetingPrompt's `{{base}}` behavior —
// present ONLY on a rewrite (an omitted `base` must not leave a stray token in a new-greeting template).

import type { CharacterCard } from "@orb/contracts/character";
import { describe } from "vitest";
import { buildGreetingPrompt, composeGreetingSteer } from "../../../../../packages/server/src/domain/character/substrate/greeting-studio.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CARD: CharacterCard = {
  name: "Aria",
  description: "A keeper of records.",
  personality: "dry",
  scenario: "The archive at dusk.",
  greetings: [{ text: "Welcome." }],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

describe("composeGreetingSteer", () => {
  test("no picks ⇒ the free text VERBATIM, untouched", () => {
    expect(composeGreetingSteer(undefined, "Make it spooky.", {})).toBe("Make it spooky.");
    expect(composeGreetingSteer([], "Make it spooky.", {})).toBe("Make it spooky.");
  });

  test("picked transform kinds compose ahead of the free text (not appended after it)", () => {
    const withPicks = composeGreetingSteer(["first-person-standard"], "Make it spooky.", {});
    expect(withPicks).not.toBe("Make it spooky.");
    expect(withPicks.length).toBeGreaterThan("Make it spooky.".length);
    expect(withPicks.endsWith("Make it spooky.")).toBe(true);
  });
});

describe("buildGreetingPrompt", () => {
  test("a new-greeting request (no base) resolves against the card without a stray {{base}} token", () => {
    const prompt = buildGreetingPrompt({ card: CARD, template: "Write a greeting for {{char}} in {{scenario}}.", steer: "cheerful" });
    expect(prompt).toContain("Aria");
    expect(prompt).toContain("The archive at dusk.");
    expect(prompt.includes("{{base}}")).toBe(false);
  });

  test("a rewrite request fills {{base}} with the existing greeting", () => {
    const prompt = buildGreetingPrompt({
      card: CARD,
      template: "Rewrite this greeting for {{char}}: {{base}}",
      steer: "shorter",
      base: "Welcome, traveler.",
    });
    expect(prompt).toContain("Welcome, traveler.");
    expect(prompt).toContain("Aria");
  });
});
