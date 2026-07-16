// Unit tests for the pacer's pure string-math cut-points (ui-package-design §6.3.1's cited test
// story: "node tests (pure string-math)"). No React, no DOM beyond `Intl.Segmenter` (available in
// Node) — these pin the exact reveal-quality contracts the pacer depends on.
//
// Imports snap.ts DIRECTLY (relative, bypassing the `@orb/ui/stream` package export) rather than
// through the barrel — the root aggregator tsconfig deliberately EXCLUDES all of packages/ui/src
// (it's a DOM-less node program), but an import through the barrel still pulls the WHOLE module
// graph reachable from stream/index.ts (including use-smooth-text.ts's DOM globals) into that
// program via module resolution, which "exclude" cannot stop (tsconfig.json's own comment: browser
// source is excluded from initial ingestion, not from transitive imports). snap.ts itself is
// DOM-free, so importing it directly keeps the aggregator's node-only program honest — the same
// precedent as tests/ui/tokens/index.test.ts's direct import of tokens.build.ts.

import { describe } from "vitest";
import { snapToGraphemeBoundary, snapToWordBoundary } from "../../../packages/ui/src/stream/snap.ts";
import { expect, test } from "../../support/fixtures";

describe("snapToWordBoundary", () => {
  test("advances to the next whitespace boundary", () => {
    expect(snapToWordBoundary("hello world", 0)).toBe(5);
    // A genuine trailing boundary (the string already moved past "world") is found and returned.
    expect(snapToWordBoundary("hello world ", 6)).toBe(11);
  });

  test("holds back a still-growing trailing partial word to the last whitespace boundary", () => {
    // "hello wor" is still being emitted (no whitespace after "wor" — the live tail of the target) —
    // scanning from inside the partial word doesn't advance past it; reveal stays at "hello ".
    expect(snapToWordBoundary("hello wor", 6)).toBe(6);
  });

  test("flows an unbroken run once it exceeds the lookahead cap (long URL / CJK-style prose)", () => {
    const longRun = "a".repeat(40); // no whitespace anywhere, well past WORD_SNAP_LOOKAHEAD
    expect(snapToWordBoundary(longRun, 0)).toBe(24);
  });

  test("flows the whole prefix when it is one unbroken run shorter than the lookahead", () => {
    const shortRun = "abc"; // still growing, no whitespace, entirely within the lookahead window
    expect(snapToWordBoundary(shortRun, 0)).toBe(0);
  });
});

describe("snapToGraphemeBoundary", () => {
  test("never splits a surrogate-pair emoji", () => {
    const text = "hi 😀 there";
    const emojiStart = text.indexOf("😀");
    // A cut mid-surrogate-pair (the emoji is 2 UTF-16 code units) snaps back before it.
    expect(snapToGraphemeBoundary(text, emojiStart + 1)).toBeLessThanOrEqual(emojiStart);
  });

  test("never splits a ZWJ family emoji sequence", () => {
    const family = "👨‍👩‍👧"; // man + ZWJ + woman + ZWJ + girl — one grapheme cluster, several code units
    const text = `team ${family} ready`;
    const clusterStart = text.indexOf(family);
    const mid = clusterStart + 3; // lands inside the ZWJ sequence
    const snapped = snapToGraphemeBoundary(text, mid);
    expect(snapped === clusterStart || snapped <= clusterStart).toBe(true);
  });

  test("is a no-op at 0, at the string end, and within plain ASCII", () => {
    expect(snapToGraphemeBoundary("hello", 0)).toBe(0);
    expect(snapToGraphemeBoundary("hello", 5)).toBe(5);
    expect(snapToGraphemeBoundary("hello", 3)).toBe(3);
  });
});
