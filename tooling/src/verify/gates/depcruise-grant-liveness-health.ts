// Policy: depcruise-grant-liveness-health — the IRREDUCIBLE BACKREFERENCE BUDGET for the dep-cruiser half of
// the `grant-liveness` family. A `$1`/`$2` capture backreference in a `.dependency-cruiser.cjs` `path`/
// `pathNot` is bound from the paired rule's capture AT CRUISE TIME, so the pattern denotes a different set
// per matched file and no static reader can test its members. The count is budgeted instead, and BOTH
// directions are RED: growth adds import-law authority nobody reviewed, and a shrink left uncommitted leaves
// a budget nobody can trust. Never a silent counter.
//
// WHY IT IS A SEPARATE POLICY, AND WHY IT IS `hard` (#2485). Its sibling `depcruise-grant-liveness` is
// `authority: "reviewed-grant"`, under which EVERY finding requires a `(subject, operation)` a central row
// could name (`lib/gate-authority.ts` — the check is reviewed-grant-only, and it withholds the whole owner
// as a TOOL ERROR when one is missing). This arm has no such identity to pass and must not acquire one: the
// budget exists to stop the unreviewable population growing SILENTLY, and a grantable budget is a central
// door to move it without touching the number — the thing the guard exists to prevent (standing law §5
// names this the ONE sanctioned non-derivable cardinality guard). So it lived inside its sibling passing no
// identity, and every drift it tried to report became `⚠ authority [invalid-reviewed-grant-identity]`
// instead: the message never printed, the run exited 2, and the sibling's other findings were withheld
// behind a diagnostic that named nothing. The arm was dead by construction — it could only ever degrade a
// run to a tool error. One authority per descriptor (standardization §2, §5), so the arm that differs on
// that axis is its own policy under the IDENTICAL family, exactly as `biome-grant-liveness-health` was
// carved out of ITS reviewed-grant sibling.
//
// THE TWO REJECTED ARMS, so the next reader does not re-open them:
//   · GIVE THE BUDGET AN IDENTITY (subject = the config, operation = the count). Satisfies the runtime and
//     defeats the guard — see above.
//   · ADMIT AN IDENTITY-LESS FINDING UNDER `reviewed-grant`. A runtime contract change weakening the
//     invariant for every reviewed-grant policy, to serve one arm that does not belong there.
//   · (Not a candidate, stated because the sibling's blindness tripwire took it) THROW, like the NO-ROWS
//     alarm. A refusal says "the run is not a verdict"; budget drift is a real, fixable finding, and
//     refusing withholds the sibling's other findings — the collateral damage #2485 reports.
//
// FAMILY: `grant-liveness`. Shared production declaration: `lib/grant-liveness.ts#irreducibleBudgetFindings`,
// the same helper the arm called from inside its sibling — the two-sided comparison is not re-implemented
// here.
//
// POPULATION PORT. This module is not a port of its own descriptor — it has none. It is an ARM carved out of
// `depcruise-grant-liveness` (`reportBudget`/`BACKREF_BUDGET`/`PATTERN_MESSAGES.budgetMoved` at
// `6f7fe543f`), whose population is `{ of: "none" }` over the same two resources minus the package
// manifests, which only the pattern-member arms read: legacy − final = ∅ and final − legacy = ∅ by
// declaration on the TypeScript side (neither side ever admitted a source file), and the resource side is
// `native-config:depcruise` + `tracked-files`, both carried over.
//
// THE COUNT IS TAKEN OVER ALL SELECTORS, where the arm used to count only the ones its sibling's file-exact
// classifier SKIPPED. Same set, one fewer dependency: `classifyRegex` admits a value only when the body
// carries no surviving regex metacharacter, and `$` is one — so a `$1` row can never classify as file-exact
// and is always skipped. Pinned against the real config in
// `tests/tooling/verify/gates/depcruise-grant-liveness-health.int.test.ts`, which counts both ways and
// requires agreement (a policy may not import a sibling gate, so the equivalence is proven in the test).
// COMMENT POSTURE: comment-SAFE — observation reads runtime config values, never source text.
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
// 16 → 14, 2026-09-20 (the `@orb/inference` extraction): the fleet yeet took `vllm-surface-isolation`'s
// `surfaces/$1` with the rule the program deleted, and re-pointing `infra-strategy-isolation` onto
// `packages/inference/src/backends/` collapsed its paired `infra/$1/([^/]+)/` + `infra/$1/$2/` into a
// single `backends/$1/` — the group axis is gone, so only the strategy capture survives. This is the
// SHRINK direction the arm's own message names, committed rather than left as a budget nobody trusts.
// Moved here from `depcruise-grant-liveness.ts` with the arm (#2485); standing law §5's sanctioned
// exception follows the arm to this module.
const BACKREF_BUDGET = 14;

/** The arm's REAL-TREE anchor — the budget is a fact about the real config set, so it is judged only where
 *  the enforcement ledger lives. A resource proof carries its own rows and would (correctly for itself,
 *  wrongly for this repo) disagree with a committed budget it knows nothing about. */
const BUDGET_ANCHOR = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

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
  family: "grant-liveness",
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
        // explicit `undefined` — spread each only when the helper produced it (the sibling's own idiom).
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
      why: "GROWTH — a capture pair added to the import-law config that no review saw. The arm's whole point, and the direction that was MUTE until #2485: under the sibling's reviewed-grant authority this finding carried no identity, so it was never printed at all",
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
