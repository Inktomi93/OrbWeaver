// THE TIER CENSUS, JUDGED BY ITS OWN STANDARD (#1003).
//
// `ops/walker/census-tier.ts` exists to catch a surface whose PAINTED pixel disagrees with the tier it
// declared — a self-oracle, deliberately inventing no slot→token table. But WHICH (slot, property, var)
// triples it censuses is hand-declared in the walker string, under a header comment that says "THE MAPPED
// PAIRS (verify against tiers.css — it moves)". A hand-maintained copy of a live map is a second map, and
// the instrument was applying to itself exactly the standard it refuses to accept from the app: prose.
// The failure is SILENT in the worst direction — a tiers.css pair the walker never censuses is a rule the
// self-oracle simply cannot see, and the run still reads as a clean tier surface.
//
// So both sides are DERIVED here and compared BOTH WAYS:
//   • tiers.css → its consuming rules' `(slot, property, --orb-tier-* var)` triples;
//   • the walker string → the same triples, from each judgeTier* call under its querySelectorAll block.
// Plus the two declaration-side invariants the walker depends on: every tier block declares the SAME set
// of vars (a var one tier omits resolves empty and the census withholds), and the declared set is exactly
// the consumed set.
//
// PARSER BLINDNESS IS THE REAL HAZARD (the roadmap.test.ts lesson): a regex that stops matching returns []
// and every set comparison passes vacuously. Every derivation is therefore floor-guarded, and each
// direction carries a PLANTED CONTROL — a fake pair injected into a copy of each source, asserted to be
// reported as a mismatch — so the comparator is proven able to fail on every run, not just at review time.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { WALKER_CENSUS_TIER } from "../../../../../tooling/src/ui-audit/ops/walker/census-tier.ts";
import { blankCssComments } from "../../../../../tooling/src/verify/lib/comment-spans.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

const TIER_MAP_REL = "packages/ui/src/styles/tiers.css";
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");

/** One censused comparison: which slot, which painted CSS property, against which sanctioned var. */
interface TierTriple {
  readonly slot: string;
  readonly property: string;
  readonly varName: string;
}

const keyOf = (triple: TierTriple): string => `${triple.slot} · ${triple.property} · ${triple.varName}`;
const keysOf = (triples: readonly TierTriple[]): string[] => triples.map(keyOf).toSorted();

// ── tiers.css side ───────────────────────────────────────────────────────────

const CSS_RULE_RE = /([^{}]+)\{([^{}]*)\}/gu;
const CSS_SLOT_RE = /\[data-slot="([a-z0-9-]+)"\]/gu;
const CSS_TIER_BLOCK_RE = /^\[data-surface-tier="([a-z0-9-]+)"\]$/u;
const TIER_VAR_RE = /var\((--orb-tier-[a-z0-9-]+)\)/u;

interface TierMap {
  /** tier value → the `--orb-tier-*` names that tier block declares. */
  readonly declared: ReadonlyMap<string, readonly string[]>;
  /** Every consuming rule's triples, one per (selector-in-list × declaration-reading-a-tier-var). */
  readonly consumed: readonly TierTriple[];
}

interface CssDeclaration {
  readonly property: string;
  readonly value: string;
}

/** Split, never regex: a `(--?[a-z0-9-]+)` property pattern reads `border-radius` as `-radius` and skips
 *  `padding` entirely — which is exactly the vacuous-parse class this file's controls exist to catch, and
 *  it did catch it (first run of this suite, 2026-09-01). Declarations are `prop: value` pairs separated by
 *  `;`, and no value in this stylesheet carries either character. */
function declarationsOf(body: string): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  for (const raw of body.split(";")) {
    const colon = raw.indexOf(":");
    const property = colon === -1 ? "" : raw.slice(0, colon).trim();
    const value = colon === -1 ? "" : raw.slice(colon + 1).trim();
    if (property !== "" && value !== "") {
      out.push({ property, value });
    }
  }
  return out;
}

/** The triples ONE consuming selector contributes — empty for a selector that names no slot, and for a
 *  declaration that reads a plain token rather than a tier var (the documented opt-ins: `[data-elevated]`,
 *  `[data-nested]`, `[data-title-step="promoted"]`, `[data-subtitle-step="label"]`). */
function consumedBySelector(selector: string, decls: readonly CssDeclaration[]): TierTriple[] {
  const slot = [...selector.matchAll(CSS_SLOT_RE)].map((m) => m[1] ?? "").at(-1);
  if (slot === undefined) {
    return [];
  }
  const out: TierTriple[] = [];
  for (const decl of decls) {
    const varMatch = TIER_VAR_RE.exec(decl.value);
    if (varMatch !== null) {
      out.push({ slot, property: decl.property, varName: varMatch[1] ?? "" });
    }
  }
  return out;
}

function parseTierMap(css: string): TierMap {
  const declared = new Map<string, string[]>();
  const consumed: TierTriple[] = [];
  for (const rule of blankCssComments(css).matchAll(CSS_RULE_RE)) {
    const decls = declarationsOf(rule[2] ?? "");
    for (const selector of (rule[1] ?? "").split(",").map((s) => s.trim())) {
      const tierBlock = CSS_TIER_BLOCK_RE.exec(selector);
      if (tierBlock === null) {
        consumed.push(...consumedBySelector(selector, decls));
        continue;
      }
      const tier = tierBlock[1] ?? "";
      declared.set(tier, [...(declared.get(tier) ?? []), ...decls.filter((d) => d.property.startsWith("--orb-tier-")).map((d) => d.property)]);
    }
  }
  return { declared, consumed };
}

// ── walker side ──────────────────────────────────────────────────────────────

const WALKER_QSA_RE = /document\.querySelectorAll\("([^"]+)"\)/gu;
const WALKER_SLOT_RE = /\[data-slot='([a-z0-9-]+)'\]/gu;
/** Every judge call, with its whole argument list — the property/var pair is read out of it below. */
const WALKER_JUDGE_RE = /judgeTier(?:Length|Number|Leading)\(([^;]*?)\)\s*;/gu;
/** The var is self-identifying; the PROPERTY is the literal immediately before it, whatever the arity. */
const WALKER_PAIR_RE = /"([a-z-]+)"\s*,\s*"(--orb-tier-[a-z0-9-]+)"/u;

function parseWalkerTriples(js: string): TierTriple[] {
  const blocks = [...js.matchAll(WALKER_QSA_RE)].map((m) => ({
    index: m.index,
    slots: [...(m[1] ?? "").matchAll(WALKER_SLOT_RE)].map((s) => s[1] ?? ""),
  }));
  const out: TierTriple[] = [];
  for (const call of js.matchAll(WALKER_JUDGE_RE)) {
    const pair = WALKER_PAIR_RE.exec(call[1] ?? "");
    if (pair === null) {
      continue;
    }
    // The slot names come from the querySelectorAll this call loops over — the walker passes the slot
    // dynamically (`el.getAttribute("data-slot")`) wherever one selector list serves several slots, so
    // the enclosing block is the only place the real slot set is written down.
    const block = blocks.filter((candidate) => candidate.index < call.index).at(-1);
    for (const slot of block?.slots ?? []) {
      out.push({ slot, property: pair[1] ?? "", varName: pair[2] ?? "" });
    }
  }
  return out;
}

// ── the derivations, guarded against a silent zero ───────────────────────────

const TIERS_CSS = readFileSync(join(REPO_ROOT, TIER_MAP_REL), "utf-8");
const MIN_TIERS = 2;
const MIN_TRIPLES = 8;

describe("density-tier census parity (walker ↔ tiers.css)", () => {
  test("both derivations produced a real population — a vacuous zero is a broken parser, not agreement", () => {
    const map = parseTierMap(TIERS_CSS);
    const walker = parseWalkerTriples(WALKER_CENSUS_TIER);
    expect(map.declared.size, `no [data-surface-tier="…"] declaration block parsed out of ${TIER_MAP_REL}`).toBeGreaterThanOrEqual(MIN_TIERS);
    expect(map.consumed.length, `no --orb-tier-* consuming rule parsed out of ${TIER_MAP_REL}`).toBeGreaterThanOrEqual(MIN_TRIPLES);
    expect(walker.length, "no judgeTier* call parsed out of WALKER_CENSUS_TIER").toBeGreaterThanOrEqual(MIN_TRIPLES);
  });

  test("every tier declares the SAME var set — a var one tier omits resolves empty and is silently withheld", () => {
    const { declared } = parseTierMap(TIERS_CSS);
    const [first, ...rest] = [...declared.entries()];
    expect(first).toBeDefined();
    for (const [tier, names] of rest) {
      expect(names.toSorted(), `tier "${tier}" declares a different --orb-tier-* set than "${first?.[0] ?? ""}"`).toEqual((first?.[1] ?? []).toSorted());
    }
  });

  test("every declared --orb-tier-* var is consumed, and every consumed var is declared", () => {
    const { declared, consumed } = parseTierMap(TIERS_CSS);
    const declaredNames = [...new Set([...declared.values()].flat())].toSorted();
    const consumedNames = [...new Set(consumed.map((t) => t.varName))].toSorted();
    expect(consumedNames, "a declared var no rule reads is a dead step; a consumed var no tier sets resolves empty").toEqual(declaredNames);
  });

  test("the walker censuses EXACTLY the triples tiers.css maps — both directions", () => {
    const cssKeys = keysOf(parseTierMap(TIERS_CSS).consumed);
    const walkerKeys = keysOf(parseWalkerTriples(WALKER_CENSUS_TIER));
    expect(walkerKeys, "left = what census-tier.ts judges, right = what tiers.css actually maps").toEqual(cssKeys);
  });

  // ── planted controls: the comparator must be able to fail from EITHER side ──

  test("PLANTED CONTROL — a tiers.css pair the walker never censuses is reported", () => {
    const planted = `${TIERS_CSS}\n[data-surface-tier="instrument"] { --orb-tier-planted-size: var(--text-body); }\n[data-surface-tier="form"] { --orb-tier-planted-size: var(--text-body); }\n[data-surface-tier] [data-slot="planted-slot"] { font-size: var(--orb-tier-planted-size); }\n`;
    const cssKeys = keysOf(parseTierMap(planted).consumed);
    const walkerKeys = keysOf(parseWalkerTriples(WALKER_CENSUS_TIER));
    expect(cssKeys).toContain("planted-slot · font-size · --orb-tier-planted-size");
    expect(walkerKeys).not.toEqual(cssKeys);
  });

  test("PLANTED CONTROL — a walker pair tiers.css no longer sets is reported", () => {
    const planted = `${WALKER_CENSUS_TIER}\n  var plantedEls = document.querySelectorAll("[data-slot='planted-slot']");\n  judgeTierLength(plantedEls[0], "form", "planted-slot", "font-size", "--orb-tier-planted-size", "12px", false);\n`;
    const cssKeys = keysOf(parseTierMap(TIERS_CSS).consumed);
    const walkerKeys = keysOf(parseWalkerTriples(planted));
    expect(walkerKeys).toContain("planted-slot · font-size · --orb-tier-planted-size");
    expect(walkerKeys).not.toEqual(cssKeys);
  });

  test("PLANTED CONTROL — a tier that stops declaring one var is reported", () => {
    const planted = TIERS_CSS.replace("--orb-tier-row-atom-gap: var(--spacing-tight);", "");
    const { declared } = parseTierMap(planted);
    const sets = [...declared.values()].map((names) => names.toSorted().join(","));
    expect(new Set(sets).size, "the two tier blocks must now disagree").toBeGreaterThan(1);
  });

  test("PLANTED CONTROL — a parser that stops matching produces a zero, never a pass", () => {
    expect(parseTierMap("/* nothing but a comment */").consumed).toHaveLength(0);
    expect(parseWalkerTriples("var x = 1;")).toHaveLength(0);
  });
});
