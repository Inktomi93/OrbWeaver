// Backreference selectors retain the sanctioned two-sided budget from gate-runtime-standardization §5.
// Singleton: native dependency-cruiser configuration supplies the selectors; this policy judges only budget drift.
import type { GatePolicyFileFindingDetails } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { irreducibleBudgetFindings } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";

/** A `$1`/`$2` capture BACKREFERENCE: dep-cruiser binds it from the paired `path`'s capture at cruise time,
 *  so the pattern denotes a different set per matched file and has no member set of its own to test. */
const BACKREF_RE = /\$\d/u;

/** The committed count of irreducible backreference rows. Two-sided: growth adds unreviewed authority, and
 *  an uncommitted shrink leaves a budget nobody can trust (#973 — never a silent counter). */
// The helper-world rule adds one paired capture to permit same-world edges while refusing upward ones.
// dependency-cruiser-worlds.int.test.ts proves that distinction, including transitive and type-only edges.
// The package-subpath-crossing rule adds one paired capture: a `#src/` import is legal only inside the importer's own module.
// package-subpath-boundaries.test.ts proves that distinction for every package module shape.
const BACKREF_BUDGET = 15;

/** The arm's REAL-TREE anchor — the budget is a fact about the real config set, so it is judged only where
 *  the enforcement ledger lives. A resource proof carries its own rows and would (correctly for itself,
 *  wrongly for this repo) disagree with a committed budget it knows nothing about. */
const BUDGET_ANCHOR = "docs/law/Core-Enforcement-Active-Gates.md";

const MESSAGE =
  "the count of IRREDUCIBLE `$1`-backreference patterns in .dependency-cruiser.cjs is {actual}, but the " +
  "committed budget is {budget}. These are the rows whose member set dep-cruiser binds from the paired " +
  "rule's capture at cruise time, so no static reader can test them — the budget is what keeps that " +
  "population from growing silently. GROWTH: justify the new pair or express it without a capture. " +
  "SHRINK: commit it, by lowering BACKREF_BUDGET in " +
  "tooling/src/verify/gates/depcruise-grant-liveness-health.ts.";

/** A config whose `from.path` carries `count` distinct backreference rows plus one ordinary prefix, so the
 *  fixture exercises the filter rather than a list of one shape. */
function backrefConfig(count: number): string {
  const rows = ['"^packages/server/"', ...Array.from({ length: count }, (_, i) => `"^packages/p${String(i)}/([^/]+)/$1/"`)];
  return `module.exports = { forbidden: [{ name: "r", from: { path: [${rows.join(", ")}] }, to: {} }] };\n`;
}

/** The real-tree anchor, planted so a proof row can reach the arm at all. Its CONTENT is never read — the
 *  arm asks only whether the enforcement ledger is tracked. */
const ANCHOR_FILES: Readonly<Record<string, string>> = { [BUDGET_ANCHOR]: "# Core-Enforcement-Active-Gates\n" };

export const gate = defineGate({
  id: "depcruise-grant-liveness-health",
  application: "implementation",
  family: "depcruise-grant-liveness-health",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the import-law config and the tracked corpus are closed ResourceHost facts; this policy judges no TypeScript source" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "native-config", id: "depcruise" }, { kind: "tracked-files" }],
  message: MESSAGE,
  fix:
    "GROWTH: justify the new capture pair in .dependency-cruiser.cjs or express the rule without one. " +
    "SHRINK: commit the new count by lowering BACKREF_BUDGET in " +
    "tooling/src/verify/gates/depcruise-grant-liveness-health.ts, naming the rule change that moved it. " +
    "There is no suppression door: this policy is `hard` because a grantable budget is a central door to " +
    "move the number without touching it.",
  create: (ctx) => ({
    evaluate: () => {
      // Both declared resources are acquired every run — the receipt phase reds an unconsumed declaration,
      // and population resolution already refused a non-ready fact before `create` ran.
      const native = readyResourceValue(ctx.resources.nativeConfig("depcruise"));
      const repoPaths = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      if (!repoPaths.includes(BUDGET_ANCHOR)) {
        return;
      }
      const actual = native.selectors.filter((selector) => BACKREF_RE.test(selector.value)).length;
      for (const finding of irreducibleBudgetFindings(CONFIG_REL, actual, BACKREF_BUDGET, MESSAGE)) {
        // `message`/`token` are optional on the shared `Finding`, and `exactOptionalPropertyTypes` refuses an
        // explicit `undefined` — spread each only when the helper produced it.
        const base: GatePolicyFileFindingDetails = { line: 1, column: 1 };
        const withMessage = finding.message === undefined ? base : { ...base, message: finding.message };
        ctx.report.file(finding.file, finding.token === undefined ? withMessage : { ...withMessage, token: finding.token });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...ANCHOR_FILES, [CONFIG_REL]: backrefConfig(BACKREF_BUDGET + 1) },
      expect: { count: 1, token: `${String(BACKREF_BUDGET + 1)} vs ${String(BACKREF_BUDGET)}`, messageIncludes: "GROWTH: justify the new pair" },
      why: "a backreference count above the sanctioned budget is an unsuppressible finding",
    },
    {
      mode: "resource",
      files: { ...ANCHOR_FILES, [CONFIG_REL]: backrefConfig(BACKREF_BUDGET - 1) },
      expect: { count: 1, token: `${String(BACKREF_BUDGET - 1)} vs ${String(BACKREF_BUDGET)}`, messageIncludes: "SHRINK: commit it" },
      why: "the OTHER direction, which a one-sided ratchet would pass: an uncommitted shrink leaves a budget nobody can trust, so the count is an EQUALITY. The token discriminates the two rows, whose message differs only in the substituted numbers",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...ANCHOR_FILES, [CONFIG_REL]: backrefConfig(BACKREF_BUDGET) },
      why: "the committed count — silent. The ordinary prefix row in every fixture is also the filter control: it is a selector the BACKREF test must NOT count, so widening `BACKREF_RE` to match any pattern reds this row",
    },
    {
      mode: "resource",
      files: { [CONFIG_REL]: backrefConfig(BACKREF_BUDGET + 1) },
      why: "§4.5 NARROWING — the REAL-TREE ANCHOR. The same over-budget config with the enforcement ledger ABSENT is silent, because a fixture corpus carries its own rows and cannot be judged against this repository's committed number; delete the `repoPaths.includes(BUDGET_ANCHOR)` test and this row reds",
    },
  ],
});
