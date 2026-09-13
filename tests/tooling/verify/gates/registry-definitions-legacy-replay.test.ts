// THE §4.6 REPLAY GROUNDWORK FOR THE `registry-definitions` FAMILY (#2319, family 3) — the FROZEN CLOSURE
// capability, and the measured reason the nine tables cannot be declared yet.
//
// WHAT THIS FILE SETTLES, AND WHAT IT DELIBERATELY DOES NOT. It settles that all nine legacy descriptors
// LOAD and REPLAY (the family-3 pre-check found nine of nine are real conversions, every frozen blob a pure
// AST reader). It does NOT declare the nine per-example tables, because measuring them first showed the
// FINAL side is withheld on every single example for a reason that is about the FIXTURES, not the gates —
// receipted below rather than described.
//
// ── DEFECT ONE, FIXED: replayability was silently bounded by post-conversion `lib/` churn ────────────────
// `loadFrozenGate` used to shim a frozen module's RELATIVE imports against TODAY's tree, so a descriptor
// whose `lib/` dependency was later deleted or renamed could not be LOADED AT ALL — and it failed as
// `Cannot find module`, which reads as a broken test rather than as a missing capability. WHICH modules
// were replayable was therefore decided by an accident of which refactors happened AFTER each conversion,
// and it got worse every time the program consolidated a reader. `extractFrozenClosure` now fetches the
// whole relative-import closure at the SAME frozen SHA. Non-relative specifiers keep today's resolution on
// purpose — one `ts-morph` instance, or the two engines carry different `SyntaxKind` identities.
//
// ── DEFECT TWO, MEASURED AND NOT PAPERED OVER: the legacy fixtures under-declare the final POPULATIONS ───
// Every final policy in this family declares a SEMANTIC population (`ModalDefinition`, `SectionDefinition`,
// `ChromeEntry`, `CHROME_ZONES`, `ContributorRegistry`, `HomeTileContribution`, `CONFIG_GROUP_IDS`,
// `MODAL_SLOT_IDS`). A legacy example's file map was written for a descriptor that declared none, so on
// those bytes the member denominator resolves to ZERO and `receiptFailures` REFUSES the owner. That is the
// documented trap — *"a population fence cannot be falsified by a fixture that admits NOTHING; the run comes
// back a `[population]` TOOL ERROR, not a finding"* — and it means **a naive table over these nine would
// read `legacy N → final 0` on every mustFlag row and could be mis-filed as N retired arms.** It is not:
// the final side never ran. The arm below asserts the refusal BY POPULATION NAME so the next lane inherits
// a measurement instead of a surprise, and §4.6's own answer is the `repair`/twin mechanism (complete the
// fixture, prove the completion INERT on the legacy side) — that is the remaining work, per module.
import { existsSync } from "node:fs";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as homeTileRegistryCompleteness } from "../../../../tooling/src/verify/gates/home-tile-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as noParallelSectionMap } from "../../../../tooling/src/verify/gates/no-parallel-section-map.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { gate as sectionFactoryContributionBundle } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { createDifferential, frozenClosureOf, frozenLegacyGate, label, legacyScenarios } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FALLBACK = "packages/client/src/features/x/__no-example-files-map__.tsx";

/** The seven non-split members, in the order the orchestrator named: the three `f5b222e10` siblings and
 *  `577d03d63`'s trio first, so the multi-module conversion commits get one coherent read. The two SPLIT
 *  members (`config-group-completeness` `58370d705`, `section-registry-completeness` `dd862e988`) are LAST
 *  and are not in this chunk. */
const MEMBERS: readonly (readonly [string, string, GatePolicy, readonly string[]])[] = [
  ["modal-body-not-placeholder", "f5b222e10", modalBodyNotPlaceholder, ["ModalDefinition"]],
  ["modal-registry-completeness", "f5b222e10", modalRegistryCompleteness, ["ModalDefinition"]],
  ["placeholder-copy-registry", "f5b222e10", placeholderCopyRegistry, ["SectionDefinition"]],
  ["chrome-registry-completeness", "577d03d63", chromeRegistryCompleteness, ["ChromeEntry"]],
  ["section-factory-contribution-bundle", "f16cde889", sectionFactoryContributionBundle, ["ContributorRegistry", "SectionDefinition factory"]],
  ["home-tile-registry-completeness", "614b2cb55", homeTileRegistryCompleteness, ["HomeTileContribution"]],
  ["no-parallel-section-map", "614b2cb55", noParallelSectionMap, ["CHROME_ZONES", "CONFIG_GROUP_IDS", "MODAL_SLOT_IDS"]],
];

/** TOTAL: this family's only expected refusal shape is the empty semantic population. Anything else THROWS
 *  rather than being absorbed, which is what stops a new refusal from hiding inside a "known" bucket. The
 *  code KEEPS THE POPULATION NAMES, because "it refused" is not the finding — WHICH denominator came back
 *  empty is what tells the next lane what its `repair` has to construct. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  if (!message.includes("resolved zero members")) {
    throw new Error(`unclassified refusal from ${owner}/${phase}: ${message}`);
  }
  const names: readonly string[] = [...new Set([...message.matchAll(/population "([^"]+)"/gu)].map((match) => String(match[1])))];
  return `${owner}/${phase}: zero-member population(s): ${names.join(", ")}`;
}

test("§4.6 — all seven non-split legacy descriptors LOAD through the frozen closure and replay", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const loaded: string[] = [];
  for (const [id, base] of MEMBERS) {
    const legacy = await frozenLegacyGate(scratch, base, `tooling/src/verify/gates/${id}.ts`);
    expect(legacy.name, `${id} — the frozen blob is the LEGACY descriptor`).toBe(id);
    expect(legacyScenarios(legacy, FALLBACK).length, `${id} — the legacy corpus is non-empty`).toBeGreaterThan(0);
    loaded.push(id);
  }
  expect(loaded).toEqual(MEMBERS.map(([id]) => id));
});

// ── THE FROZEN-CLOSURE CONTROLS, both directions ──────────────────────────────────────────────────────

test("the frozen closure extracts an era-matched dep that NO LONGER EXISTS on today's tree", ({ scratch }) => {
  // THE PLANTED CONTROL, and it is a REAL permanent instance rather than a fixture: `placeholder-copy-registry`
  // at `f5b222e10` imports `../lib/section-defs.ts`, which is gone today. Under the old resolver this module
  // died at import with `Cannot find module`; under the closure it loads.
  const closure = frozenClosureOf(scratch, "f5b222e10", "tooling/src/verify/gates/placeholder-copy-registry.ts");
  expect(closure.extracted, "the entry module is extracted first").toContain("tooling/src/verify/gates/placeholder-copy-registry.ts");
  expect(closure.extracted, "the era-matched dep is pulled from the frozen SHA").toContain("tooling/src/verify/lib/section-defs.ts");
  expect(existsSync("tooling/src/verify/lib/section-defs.ts"), "the control's whole point — that dep is ABSENT from today's tree").toBe(false);
  expect(closure.depth, "the closure is deeper than the entry module alone").toBeGreaterThan(0);
});

test("the frozen closure REFUSES LOUDLY when a dep is absent at the frozen SHA too", ({ scratch }) => {
  // The other direction: a path that is missing at the base is a WRONG BASE or a wrong path, not
  // post-conversion churn, and the harness must say so instead of `Cannot find module`.
  expect(() => {
    frozenClosureOf(scratch, "f5b222e10", "tooling/src/verify/gates/no-such-gate-ever.ts");
  }).toThrow("does not exist at that SHA either");
});

// ── THE MEASURED BLOCKER, asserted rather than described ──────────────────────────────────────────────

test("§4.6 — every final policy in this family REFUSES on its own legacy corpus: the fixtures predate its semantic population", {
  timeout: scaledBudget(300_000),
}, async ({ scratch }) => {
  const witnessed: string[] = [];
  for (const [id, base, policy, populations] of MEMBERS) {
    const differential = createDifferential(`/registry-${id}`, toolErrorCode);
    const legacy = await frozenLegacyGate(scratch, base, `tooling/src/verify/gates/${id}.ts`);
    const files = legacyScenarios(legacy, FALLBACK)[0];
    if (files === undefined) {
      throw new Error(`${id} has no legacy example`);
    }
    const before = differential.legacyReplay(legacy, files, label);
    const after = differential.finalReplay([policy], files, label);
    // The LEGACY side runs fine — which is exactly why the zero on the final side must not be read as a
    // retired arm. One engine answered; the other was withheld before it judged anything.
    expect(before.toolErrors, `${id} — the LEGACY side is not refused`).toEqual([]);
    expect(after.toolErrors, `${id} — withheld, and BY WHICH denominator: that names what a repair must construct`).toEqual([
      `${policy.id}/receipt: zero-member population(s): ${populations.join(", ")}`,
    ]);
    expect(after.findings, `${id} — a withheld owner reports nothing, and that zero is NOT a differential`).toEqual([]);
    witnessed.push(id);
  }
  expect(witnessed, "all seven, so the blocker is the FAMILY's shape and not one awkward module").toEqual(MEMBERS.map(([id]) => id));
});
