// Unit: the per-character default tint (features/chat/lib/speaker-color, #21 §12.4). Pins the
// determinism gate (pure hash — same key always paints the same color) and the OKLCH shape/safety.

import { colorForCharacter } from "../../../../../packages/client/src/features/chat/lib/speaker-color.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OKLCH_SHAPE = /^oklch\(72% 0\.16 \d+(?:\.\d+)?\)$/u;
const OKLCH_HUE_CAPTURE = /oklch\(72% 0\.16 (\d+(?:\.\d+)?)\)/u;

test("the same key always produces the same color (determinism)", () => {
  expect(colorForCharacter("char_alice")).toEqual(colorForCharacter("char_alice"));
});

test("different keys produce different colors (in the common case)", () => {
  expect(colorForCharacter("char_alice")).not.toEqual(colorForCharacter("char_bob"));
});

// The SPEECH tokens share the hue; NARRATION is not the hash's to colour (#212-5). This test used to
// assert `narrationColor === speaker` — it pinned the defect: the row's ThemeScope wrote that hash into
// `--color-narration`, so every `<em>` narration run rendered in the speaker's dialogue ink and the
// speech/emphasis distinction collapsed. The token is absent now, so the palette's own narration ink
// survives (an authored card override still wins — that path never came through here).
test("the hash colours SPEECH only — speaker and dialogue share a hue, narration is not emitted", () => {
  const tokens = colorForCharacter("char_alice");
  expect(tokens.dialogueColor).toBe(tokens.speaker);
  expect(Object.keys(tokens).toSorted()).toEqual(["dialogueColor", "speaker"]);
});

test("the generated color is a fixed-lightness/chroma OKLCH string", () => {
  const tokens = colorForCharacter("char_alice");
  expect(tokens.speaker).toMatch(OKLCH_SHAPE);
});

test("the hue wraps into [0, 360)", () => {
  // A long key stresses the hash into large intermediate values; the modulus must still floor it.
  const tokens = colorForCharacter("a-very-long-speaker-name-used-to-stress-the-fnv1a-hash-hue-math");
  const match = OKLCH_HUE_CAPTURE.exec(tokens.speaker);
  expect(match).not.toBeNull();
  const hue = Number(match?.[1]);
  expect(hue).toBeGreaterThanOrEqual(0);
  expect(hue).toBeLessThan(360);
});

test("an empty-string key is handled deterministically (no throw)", () => {
  expect(() => colorForCharacter("")).not.toThrow();
  expect(colorForCharacter("")).toEqual(colorForCharacter(""));
});
