// engine/character-line — the one "who is this" line both Smart pickers read: the distilled pitch, else the
// card's leading sentences, else its tags, never the whole card; a blank card leaves the consumer the name alone.

import { describe } from "vitest";
import { characterLine } from "../../../../../packages/server/src/domain/chat/engine/character-line.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CARD = {
  name: "Maelis",
  personality: "{{char}} reads maps, tracks and weather. Terse and precise. Knows every wild road. Hates cities.",
  description: "An elf scout.",
};

describe("characterLine", () => {
  test("a distilled card uses its pitch", () => {
    expect(characterLine(CARD, { elevatorPitch: "The caravan's scout and guide.", tags: ["elf"] }, 0)).toBe("The caravan's scout and guide.");
  });

  test("an undistilled card uses its personality's first two sentences, macros rendered, never the rest", () => {
    expect(characterLine(CARD, undefined, 0)).toBe("Maelis reads maps, tracks and weather. Terse and precise.");
    // A distillate whose pitch came back blank is undistilled for this purpose.
    expect(characterLine(CARD, { elevatorPitch: "  ", tags: [] }, 0)).toBe("Maelis reads maps, tracks and weather. Terse and precise.");
  });

  test("a blank personality falls to the description, then to the distilled tags", () => {
    expect(characterLine({ ...CARD, personality: " \n" }, undefined, 0)).toBe("An elf scout.");
    expect(characterLine({ ...CARD, personality: null, description: null }, { elevatorPitch: null, tags: ["scout", "elf"] }, 0)).toBe("scout, elf");
  });

  test("a blank card gives no line, so the consumer shows the name only", () => {
    expect(characterLine({ name: "Maelis", personality: null, description: "" }, undefined, 0)).toBe("");
    expect(characterLine(null, undefined, 0)).toBe("");
  });
});
