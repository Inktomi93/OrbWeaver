// The variant-arm matrix PARITY suite — the mechanism that lets coverage grow without silent gaps
// (design record: variant-arm-matrix.def.ts). Three closures, each with a planted control proving the
// red direction exists:
//
//   1. POPULATION: every tv() export with a variants block discovered ON DISK under packages/ui/src is
//      either storied or withheld BY NAME — a new variants.ts (or a new tv export in an old one) REDS
//      here naming itself. Discovery is RUNTIME import of the live modules — the same object the
//      component renders with — never a ts-morph source read (`as const satisfies` blinds ts-morph
//      initializers; shared-memory as-const-satisfies-blinds-ts-morph-initializer).
//   2. PLAN VALUE COVERAGE: every declared axis value (plus the __unset arm of default-less axes)
//      appears in at least one planned cell — pins the pairwise planner + any future legality filter
//      against silently dropping an arm.
//   4. PAGE→NODE SEAM: the CT's pass-2 classifier payload is validated, not cast (#1015) — every arm of
//      that refusal is pinned here, on the node side, because the CT cannot assert its own throw.
//   3. RULE SCOPE: the audited arm-dependent rule set (2026-08-31 Base-UI mechanism audit, task #19) is
//      fully partitioned into judged / out-of-scope / withheld-with-reason — a new arm-dependent rule
//      cannot be silently unjudged, and a rule rename breaks the names here against
//      DESIGN_AUDIT_RULE_IDS.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DESIGN_AUDIT_RULE_IDS } from "@orb/tooling/ui-audit";
// `describe` has no composed-fixture surface; test/expect ride the fixture door (test-fixture-imports).
import { describe } from "vitest";
import { expect, test } from "../support/fixtures.ts";
import { introspectTv, JUDGED_RULES, OUT_OF_SCOPE_RULES, VARIANT_ARM_STORY_DEFS, WITHHELD_RULES, WITHHELD_VARIANT_SOURCES } from "./variant-arm-matrix.def.ts";
import { inactiveClassification } from "./variant-arm-matrix.gather.ts";
import { STORY_KEYS } from "./variant-arm-matrix.keys.ts";
import type { DiscoveredTv } from "./variant-arm-matrix.plan.ts";
import { armPlanFor, buildParityReport, unplannedValues } from "./variant-arm-matrix.plan.ts";

const UI_SRC = join(import.meta.dirname, "..", "..", "packages", "ui", "src");

function variantsFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      found.push(...variantsFilesUnder(abs));
    } else if (entry === "variants.ts") {
      found.push(abs);
    }
  }
  return found;
}

/** Runtime discovery: import each variants.ts and keep every export that is a tv() result with a
 *  NON-EMPTY variants block — the exact criterion the def module stories against. */
async function discoverTvExports(): Promise<DiscoveredTv[]> {
  const files = variantsFilesUnder(UI_SRC);
  // SCAN DECLARATION (the zero-file lesson): an empty walk is "I could not search", never "none exist".
  if (files.length <= 30) {
    throw new Error(`variant-arm parity: the variants.ts census under ${UI_SRC} found only ${String(files.length)} files — the walk is broken, not the tree`);
  }
  const discovered: DiscoveredTv[] = [];
  for (const abs of files) {
    const rel = abs.slice(UI_SRC.length + 1);
    const mod = (await import(abs)) as Readonly<Record<string, unknown>>;
    for (const [exportName, value] of Object.entries(mod)) {
      const candidate = value as { readonly variants?: unknown };
      const hasVariants =
        typeof value === "function" && typeof candidate.variants === "object" && candidate.variants !== null && Object.keys(candidate.variants).length > 0;
      if (hasVariants) {
        discovered.push({ id: `${rel}::${exportName}` });
      }
    }
  }
  return discovered;
}

describe("population parity (disk census ↔ storied ∪ withheld)", () => {
  test("every discovered tv export is storied or withheld BY NAME; no stale or doubled rows", async () => {
    const discovered = await discoverTvExports();
    const report = buildParityReport(discovered, VARIANT_ARM_STORY_DEFS, WITHHELD_VARIANT_SOURCES);
    expect(report.unaccounted, "NEW tv exports with variants blocks — story them or withhold them by name in variant-arm-matrix.def.ts").toEqual([]);
    expect(report.stale, "rows for tv exports that no longer exist on disk — delete them").toEqual([]);
    expect(report.doubled, "rows that are BOTH storied and withheld — contradiction").toEqual([]);
  });

  test("PLANTED CONTROL: dropping a story from the table is reported by name (the loud direction)", async () => {
    const discovered = await discoverTvExports();
    const minusBadge = VARIANT_ARM_STORY_DEFS.filter((story) => story.key !== "badge");
    const report = buildParityReport(discovered, minusBadge, WITHHELD_VARIANT_SOURCES);
    expect(report.unaccounted).toEqual(["primitives/badge/variants.ts::badgeVariants"]);
  });

  test("PLANTED CONTROL: a row naming a tv export that does not exist is reported stale", async () => {
    const discovered = await discoverTvExports();
    const withGhost = { ...WITHHELD_VARIANT_SOURCES, "primitives/ghost/variants.ts::ghostVariants": "planted" };
    const report = buildParityReport(discovered, VARIANT_ARM_STORY_DEFS, withGhost);
    expect(report.stale).toEqual(["primitives/ghost/variants.ts::ghostVariants"]);
  });

  test("story keys and the keys-module vocabulary are the same set", () => {
    expect(VARIANT_ARM_STORY_DEFS.map((story) => story.key).toSorted()).toEqual([...STORY_KEYS].toSorted());
  });
});

describe("plan value coverage (no arm silently dropped)", () => {
  for (const story of VARIANT_ARM_STORY_DEFS) {
    // 30s: the pairwise engine takes ~7s on text's 8-axis space (measured 2026-09-01) — a real cost,
    // not a hang; the plan is cached module-side in the CT suite so it is paid once per process.
    test(`${story.key}: every axis value (incl. __unset arms) reaches at least one planned cell`, { timeout: 30_000 }, () => {
      const plan = armPlanFor(story);
      expect(plan.cells.length, "a story must plan at least one cell").toBeGreaterThan(0);
      expect(unplannedValues(plan), `values the ${plan.strategy} plan never renders`).toEqual([]);
    });
  }

  test("PLANTED CONTROL: a cell set missing one value is reported as unplanned", () => {
    const fakeTv = Object.assign(() => "", {
      variants: {
        tone: { a: "x", b: "x", c: "x" },
        size: { sm: "x", md: "x", lg: "x" },
      },
      defaultVariants: { tone: "a", size: "sm" },
    });
    const story = {
      key: "badge",
      source: "planted/fake.ts",
      exportName: "fakeTv",
      tv: introspectTv(fakeTv, "planted"),
      supportsDisabled: false,
      expectText: true,
    } as const;
    const plan = armPlanFor(story);
    const tampered = { ...plan, cells: plan.cells.filter((cell) => cell.id.includes("tone=c") === false) };
    expect(unplannedValues(tampered)).toEqual(["tone=c"]);
  });
});

/** The arm-dependent set from the 2026-08-31 audit (scratchpad the retired cb-baseui-rule-audit review §Arm-dependence),
 *  spelled here as the DURABLE copy: tone/intent pick the colour pair (contrast family), size picks the
 *  box (tap/aspect/text floors), state+carrier arms gate the glows, radius/border arms the accents. */
const ARM_DEPENDENT_RULES = [
  "contrast",
  "text-over-art",
  "hover-contrast",
  "inactive-control-legibility",
  "gray-on-color",
  "quiet-state",
  "glow-shadow",
  "radial-halo",
  "radial-spotlight-glow",
  "tap-target",
  "control-aspect",
  "text-below-ramp",
  "undersized-ui-text",
  "off-theme-font",
  "border-accent-on-rounded",
  "side-tab",
] as const;

describe("rule-scope parity (the 16 arm-dependent rules, fully partitioned)", () => {
  test("judged ∪ out-of-scope ∪ withheld === the audited arm-dependent set, exactly", () => {
    const partitioned = [...JUDGED_RULES, ...OUT_OF_SCOPE_RULES, ...Object.keys(WITHHELD_RULES)].toSorted();
    expect(partitioned, "every arm-dependent rule is judged, out-of-scope, or withheld WITH a reason — no silent gaps").toEqual(
      [...ARM_DEPENDENT_RULES].toSorted(),
    );
  });

  test("every partitioned rule name is a live design-audit rule id (a rename reds here)", () => {
    const live = new Set<string>(DESIGN_AUDIT_RULE_IDS);
    for (const rule of ARM_DEPENDENT_RULES) {
      expect(live.has(rule), `"${rule}" is not a DESIGN_AUDIT_RULE_IDS member`).toBe(true);
    }
  });

  test("every withheld rule carries a non-empty mechanism reason", () => {
    for (const [rule, reason] of Object.entries(WITHHELD_RULES)) {
      expect(reason.length, `withheld rule "${rule}" needs its mechanism reason`).toBeGreaterThan(20);
    }
  });
});

// ── the CT's page→node seam (#1015) ──────────────────────────────────────────
// The suite's pass-2 classifier runs as a STRING script (INACTIVE_KIND_EXPR must be inlined verbatim),
// so its payload crosses the boundary as `unknown` and used to be settled with a cast. These are the
// refusals that replaced it — the missing-ref arm is the load-bearing one, because the CT consumer reads
// `inactiveByRef[ref] ?? "none"` and a skipped ref therefore reads as an ACTIVE control judged against
// the full AA floor.

describe("the variant-arm CT's inactive-classifier seam refuses instead of casting", () => {
  const refs = ["r0", "r1"];

  test("a complete payload passes through, kinds intact", () => {
    expect(inactiveClassification({ r0: "native", r1: "none" }, refs)).toEqual({ r0: "native", r1: "none" });
  });

  test("a payload that is not a ref→kind map is refused", () => {
    expect(() => inactiveClassification(null, refs)).toThrow(/INSTRUMENT ERROR.*not a ref→kind map/u);
    expect(() => inactiveClassification(["native"], refs)).toThrow(/INSTRUMENT ERROR.*not a ref→kind map/u);
  });

  test("a value outside the shared InactiveKind vocabulary is refused, naming the ref", () => {
    expect(() => inactiveClassification({ r0: "disabled", r1: "none" }, refs)).toThrow(/INSTRUMENT ERROR.*"r0".*native\/aria\/inert/u);
    expect(() => inactiveClassification({ r0: true, r1: "none" }, refs)).toThrow(/INSTRUMENT ERROR.*"r0"/u);
  });

  test("a SAMPLED ref the classifier skipped is refused — the silent arm, which would read as active", () => {
    expect(() => inactiveClassification({ r0: "native" }, refs)).toThrow(/INSTRUMENT ERROR.*skipped 1 sampled ref.*r1/u);
    expect(() => inactiveClassification({}, refs)).toThrow(/INSTRUMENT ERROR.*skipped 2 sampled ref/u);
  });

  test("extra refs the page classified but pass 1 did not sample are harmless", () => {
    expect(inactiveClassification({ r0: "none", r1: "none", r2: "aria" }, refs)["r2"]).toBe("aria");
  });
});
