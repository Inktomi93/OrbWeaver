// Unit: zone derivation (features/preset/components/prompt-assembly/derive-zones). PURE, node lane, DEEP
// import (not the feature barrel — dom-less graph). Proves the setup/post split derives from the FIRST
// chat_history pivot, the missing-pivot + duplicate-pivot flags, and the per-zone enabled-count +
// token-estimate roll-ups the summary strip reads. Zones are DERIVED here, never stamped (BUILD-SPEC §2.1).

import type { PromptSection } from "@orb/contracts/preset";
import { deriveZones } from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/derive-zones";
import { expect, test } from "../../../../../support/fixtures";

function literal(id: string, content: string, enabled = true): PromptSection {
  return { type: "literal", id, name: id, role: "system", content, enabled };
}

function pivot(id: string, enabled = true): PromptSection {
  return { type: "marker", id, name: id, marker: "chat_history", role: "system", enabled };
}

test("first chat_history splits setup (above) from post (at + below)", () => {
  const sections = [literal("a", "aaaa"), pivot("hist"), literal("b", "bbbb")];
  const zones = deriveZones(sections);

  expect(zones.pivotIndex).toBe(1);
  expect(zones.missingPivot).toBe(false);
  expect(zones.zoneOf(0)).toBe("setup");
  expect(zones.zoneOf(1)).toBe("post"); // the pivot itself opens the post zone
  expect(zones.zoneOf(2)).toBe("post");
});

test("missingPivot flag set when no chat_history — every section falls to setup", () => {
  const sections = [literal("a", "aaaa"), literal("b", "bbbb")];
  const zones = deriveZones(sections);

  expect(zones.missingPivot).toBe(true);
  expect(zones.pivotIndex).toBe(-1);
  expect(zones.zoneOf(0)).toBe("setup");
  expect(zones.zoneOf(1)).toBe("setup");
});

test("duplicate pivots: first wins for zoning; the rest are reported as duplicates", () => {
  const sections = [literal("a", "aaaa"), pivot("hist1"), literal("b", "bbbb"), pivot("hist2")];
  const zones = deriveZones(sections);

  expect(zones.pivotIndex).toBe(1); // first-wins derivation
  expect(zones.duplicatePivotIndexes).toEqual([3]);
  expect(zones.zoneOf(2)).toBe("post"); // still derived from the FIRST pivot
  expect(zones.zoneOf(3)).toBe("post");
});

test("summaries count only ENABLED sections and sum their token estimates per zone", () => {
  const sections = [
    literal("a", "aaaaaaaa"), // 8 chars ⇒ 2 tokens, setup, enabled
    literal("off", "zzzzzzzz", false), // disabled ⇒ excluded from setup counts
    pivot("hist"),
    literal("b", "bbbbbbbbbbbb"), // 12 chars ⇒ 3 tokens, post, enabled
  ];
  const zones = deriveZones(sections);

  expect(zones.summaries.setup.enabledCount).toBe(1);
  expect(zones.summaries.setup.tokenEstimate).toBe(2);
  expect(zones.summaries.post.enabledCount).toBe(2); // the enabled literal + the enabled pivot
  expect(zones.summaries.post.tokenEstimate).toBe(3); // the pivot contributes 0
});

test("a supplied price OVERRIDES the author-text estimate — the bound readout's zone strip (D121-G)", () => {
  // Bound to a chat, the strip must add up the SAME numbers the bars under it show (F-29: one column, one
  // producer) — and the pivot, which has no author text at all, is exactly where the two used to disagree.
  const sections = [literal("a", "aaaaaaaa"), pivot("hist"), literal("b", "bbbbbbbbbbbb")];
  const priced: Record<string, number> = { a: 400, hist: 1624, b: 30 };
  const zones = deriveZones(sections, (section) => priced[section.id] ?? 0);

  expect(zones.summaries.setup.tokenEstimate).toBe(400);
  // The conversation carrier now carries real weight — the whole point of the binding.
  expect(zones.summaries.post.tokenEstimate).toBe(1654);
  // The DEFAULT is untouched: no price supplied ⇒ the chat-free author-text estimate, as before.
  expect(deriveZones(sections).summaries.post.tokenEstimate).toBe(3);
});
