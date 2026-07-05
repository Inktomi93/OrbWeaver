// section-placeholder-copy freshness test — the behavioral companion to the `placeholder-copy-registry`
// structural gate (design-enforcement §3.2; ux-flow-revamp J10). The gate pins DISTINCTNESS over the AST;
// this pins the two things a runtime read proves best: FULL SectionId coverage (the `Record<SectionId, …>`
// already forces it at compile time — this catches a stale test/registry drift the same way rail-slots.test
// does) and that the distinctness holds on the actual resolved values, not just the source literals.

import { SECTION_IDS } from "@orb/client/state";
import { describe } from "vitest";
import { SECTION_PLACEHOLDER_COPY } from "../../../../../packages/client/src/features/app-shell/lib/section-placeholder-copy";
import { expect, test } from "../../../../support/fixtures";

describe("SECTION_PLACEHOLDER_COPY", () => {
  test("every SectionId has a placeholder-copy entry (full coverage)", () => {
    const keys = Object.keys(SECTION_PLACEHOLDER_COPY).sort();
    expect(keys).toEqual([...SECTION_IDS].sort());
  });

  test("every entry carries a non-empty title + description", () => {
    for (const [id, copy] of Object.entries(SECTION_PLACEHOLDER_COPY)) {
      expect(copy.title.length, `${id} title`).toBeGreaterThan(0);
      expect(copy.description.length, `${id} description`).toBeGreaterThan(0);
    }
  });

  test("every (title, description) pair is DISTINCT (no two sections look identical)", () => {
    const pairs = Object.values(SECTION_PLACEHOLDER_COPY).map((c) => `${c.title}␟${c.description}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
