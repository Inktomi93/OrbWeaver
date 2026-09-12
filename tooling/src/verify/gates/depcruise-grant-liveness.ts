// Gate: depcruise-grant-liveness — a FILE-EXACT path in a `.dependency-cruiser.cjs` rule's `path`/`pathNot`
// names ONE file: a `pathNot` is an EXEMPTION (this one file may cross the boundary), a `path` is the rule's
// own subject. Either way, when that file is deleted or moved the row goes SILENTLY dead — an exemption
// nobody can see, or a rule aimed at nothing — and the next file created at that path inherits an import-law
// posture nobody re-approved. biome-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B) on the import-law
// config. TWO hard parts, and why this is its own policy: (1) the values are CODE, so observation runs the
// executable config through dependency-cruiser's public loader via the `native-config` ResourceHost fact;
// imported, called, spread and template-derived selectors retain their runtime values. Liveness judges the
// repository-authored root config only: `extends` package rules have a vendor lifecycle and member sources
// this repo does not own; the public loader still proves that the complete effective chain loads. (2) the
// values are REGEX SOURCE, not globs, so a path is only recognised when the pattern is FULLY ANCHORED
// (`^…$`) and carries no surviving metacharacter after unescaping `\.`/`\/`. That classifier is deliberately
// CONSERVATIVE in the direction that matters: these lists are load-bearing import law, so an ambiguous
// pattern becomes a declared SKIP, never a RED. Arms: DEAD · NO-ROWS (the §4.6 blindness tripwire) · the
// two-sided EXEMPT arms (empty-but-armed at mint — every live row resolves). MISSING/UNPARSEABLE-CONFIG are
// no longer a reportable arm of THIS policy: a `native-config` resource that cannot resolve makes population
// resolution itself throw (`resolveResourceDeclarations`), which withholds the whole run as a TOOL ERROR —
// the fail-LOUD requirement is now the runtime's own refusal, proven at `runPolicyPass` level, not by a
// `mustFlag` row (the proof harness has no "expect a tool error" arm — see the permanent-pin test).
// PATTERN LIVENESS (#973). The rows the file-exact classifier skips are no longer invisible. A pattern is
// LIVE when it matches at least one member of a FINITE tracked source — the `tracked-files` ResourceHost
// fact, or the declared-dependency module paths derived from every `package-metadata` fact (dep-cruiser
// matches MODULE paths, so `node_modules/echarts/` is live exactly while some package.json still declares
// echarts). Zero members in either = the same loaded-gun class one level up: import law aimed at nothing, or
// an exemption for a class that no longer exists. Two families cannot be judged and are RATIFIED with
// reasons + a no-growth budget: a `$1` BACKREFERENCE (its member set is bound by the paired rule's capture at
// cruise time, not by the tree) and the two by-design rows below.
// COMMENT POSTURE: comment-SAFE — observation reads runtime config values, never source text.
import type { DepcruiseConfigSnapshotField, DepcruiseSelectorSnapshot } from "../contract/config-snapshot.ts";
import type { ExemptionTable, Finding } from "../contract/gate.ts";
import type { GatePolicyContext, GatePolicyFileFindingDetails } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { PackageResourceId } from "../contract/resource-config.ts";
import { PACKAGE_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { GrantExemption, LivenessMessages, PatternLivenessMessages, PatternRow } from "../lib/grant-liveness.ts";
import { dependencyModulesFromManifests, irreducibleBudgetFindings, livenessFindings, patternLivenessFindings } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
/** Regex metacharacters that make a pattern a CLASS of paths rather than one file. A pattern still carrying
 *  any of these after anchor-stripping and `\.`/`\/` unescaping is a declared skip, never a judged row. */
const REGEX_META_RE = /[|()[\]{}*+?^$\\]/u;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real config derives far more values across its
 *  rules; a resource proof plants a handful. Counted over ALL derived values, never over the exact ones, so
 *  it can guard the very arm that judges the regex/literal classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 80;

/** Empty but ARMED at mint — every file-exact row in .dependency-cruiser.cjs resolves today, so nothing
 *  needs forgiving. The two-sided machinery is shared (lib/grant-liveness.ts) and is
 *  proven in both directions by the sibling gates' pins; a row added here inherits both arms automatically. */
const EXEMPT: ExemptionTable<GrantExemption> = {};

/** A `$1`/`$2` capture BACKREFERENCE: dep-cruiser binds it from the paired `path`'s capture at cruise time,
 *  so the pattern denotes a different set per matched file and has no member set of its own to test. */
const BACKREF_RE = /\$\d/u;
/** The committed count of irreducible backreference rows. Two-sided: growth adds unreviewed authority, and
 *  an uncommitted shrink leaves a budget nobody can trust (#973 — never a silent counter). */
// The helper-world rule adds one paired capture to permit same-world edges while refusing upward ones.
// dependency-cruiser-worlds.int.test.ts proves that distinction, including transitive and type-only edges.
const BACKREF_BUDGET = 16;

/** The BUDGET arm's own real-tree anchor — a fact about the REAL config set, so it is judged only where the
 *  enforcement ledger lives. A resource proof carries its own rows and would (correctly for itself, wrongly
 *  for this repo) disagree with a committed budget it knows nothing about. */
const BUDGET_ANCHOR = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

const GUEST_WORKER = "packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts";
const GATE_FIXTURE_LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";

/** Patterns whose liveness is NOT decidable from any tracked source — each with the exact reason, the
 *  owning decision, and an END CONDITION. Two-sided: a row .dependency-cruiser.cjs no longer carries is
 *  RED, and a cite that stopped resolving is RED. */
const RATIFIED: ExemptionTable<GrantExemption> = {
  "(^|/)__g_": {
    why:
      "the reserved throwaway-fixture sentinel: check-gates.int materialises `__g_*` files at real-tree " +
      "paths for milliseconds and reaps them, so the subject is ABSENT from every tracked source by " +
      "construction — a member test would RED a correct config, and an FS test would depend on whether a " +
      "suite happened to be mid-run. Delete this row the day the `__g_` sentinel is retired.",
    cite: GATE_FIXTURE_LAW,
  },
  "^packages/[^/]+/dist/": {
    why:
      "BUILD OUTPUT: `dist/` is gitignored, so it is absent from the tracked corpus by design and present " +
      "only after a build — judging it either way makes the verdict depend on machine state. Delete this " +
      "row the day the packages stop emitting dist/.",
    cite: ".gitignore",
  },
  "^@jitl/quickjs-ng-wasmfile-release-sync/wasm\\?url$": {
    why:
      "a vite ASSET QUERY specifier (`?url`), not a module path and not a repo file: its member set is what " +
      "the bundler emits at build time, which no static tree read can enumerate (dep-cruiser matches it " +
      "only as an unresolvable-import exemption). The cite is the one importer that makes it live — the " +
      "row dies with it.",
    cite: GUEST_WORKER,
  },
};

const PATTERN_MESSAGES: PatternLivenessMessages = {
  deadPattern:
    "a PATTERN in .dependency-cruiser.cjs matches NOTHING this repo carries — no tracked file and no " +
    "declared dependency is inside it. Import law aimed at an empty set enforces nothing, and a `pathNot` " +
    "over an empty set is an exemption nobody can see being over-broad (the loaded-gun class one level up " +
    "from a dead file-exact row, tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). Re-point the " +
    "pattern at the tier/package it means, delete the rule, or — if its members genuinely cannot be " +
    "enumerated from the tree — add a RATIFIED row in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts with its `why` + END CONDITION and a resolving " +
    "`cite`. The finding token is the pattern.",
  staleRatified:
    "a depcruise-grant-liveness RATIFIED row forgives a pattern .dependency-cruiser.cjs no longer carries — " +
    "a standing allowance for a row that is gone is a LOADED GUN. Delete the row from RATIFIED in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  deadCite:
    "a depcruise-grant-liveness RATIFIED row's `cite` no longer resolves — the decision that justified the " +
    "allowance moved or was deleted. Re-derive the cite, or delete the row from RATIFIED in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  budgetMoved:
    "the count of IRREDUCIBLE `$1`-backreference patterns in .dependency-cruiser.cjs is {actual}, but the " +
    "committed budget is {budget}. These are the rows whose member set dep-cruiser binds from the paired " +
    "rule's capture at cruise time, so no static reader can test them — the budget is what keeps that " +
    "population from growing silently. GROWTH: justify the new pair or express it without a capture. " +
    "SHRINK: commit it, by lowering BACKREF_BUDGET in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
};

const MESSAGES: LivenessMessages = {
  dead:
    "a FILE-EXACT `path`/`pathNot` in .dependency-cruiser.cjs names nothing on the tree — the import-law row " +
    "it carries is DEAD. A `pathNot` exemption whose subject was deleted is an over-grant nobody can see (and " +
    "the next file created at that path silently inherits it); a `path` subject that resolves to nothing is a " +
    "rule aimed at no file at all. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B. The finding " +
    "token is the dead path.",
  staleExempt:
    "a depcruise-grant-liveness EXEMPT row forgives a path .dependency-cruiser.cjs no longer carries — a " +
    "standing exemption for a row that is gone is a LOADED GUN. Delete the row from EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  deadCite:
    "a depcruise-grant-liveness EXEMPT row's `cite` no longer resolves — the producer that justified the " +
    "exemption moved or was deleted. Re-derive the cite, or delete the row from EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
};

const MSG_NO_ROWS =
  ".dependency-cruiser.cjs parsed but ZERO file-exact rows were derived from an anchor-sized value set — the " +
  "regex/literal classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/depcruise-grant-liveness.ts.";

interface NativeGrantRow {
  readonly path: string;
  readonly owner: string;
  readonly field: DepcruiseConfigSnapshotField;
  readonly position: number;
}

/** Map a shared-lib `Finding` (file/line/column/token?/message?) onto the final contract's
 *  `report.file`, never handing `exactOptionalPropertyTypes` an explicit `token: undefined`. */
function reportFinding(ctx: GatePolicyContext, finding: Finding, message?: string): void {
  const details: GatePolicyFileFindingDetails = { line: 1, column: 1 };
  const withMessage: GatePolicyFileFindingDetails = message === undefined ? details : { ...details, message };
  ctx.report.file(finding.file, finding.token === undefined ? withMessage : { ...withMessage, token: finding.token });
}

/** A dep-cruiser pattern is REGEX SOURCE matched against a module path. An unparseable source is treated as
 *  matching nothing, which makes it DEAD and therefore loud — dep-cruiser would reject it too. */
function regexMatcher(source: string): (member: string) => boolean {
  let re: RegExp;
  // @orb-waive caught-failure-ownership(catch): an unparseable pattern matches nothing, so it
  // surfaces through the DEAD arm with its own diagnostic rather than aborting the pass. Ends if this gate
  // grows a distinct "malformed pattern" arm.
  try {
    re = new RegExp(source, "u");
  } catch {
    return () => false;
  }
  return (member) => re.test(member);
}

/** A dep-cruiser `path` is REGEX SOURCE. It names ONE file only when it is fully anchored and, after
 *  unescaping the two escapes this corpus uses (`\.` and `\/`), carries no surviving metacharacter. Anything
 *  else — a prefix (`^packages/server/`), an alternation, a character class, a capture — is a CLASS of paths
 *  and becomes a declared skip. Conservative BY DESIGN: a false RED here would block every lane's floor. */
export function classifyRegex(value: string): string | undefined {
  const anchored = value.startsWith("^") && value.endsWith("$");
  const body = anchored ? value.slice(1, -1).replaceAll("\\.", ".").replaceAll("\\/", "/") : "";
  return body !== "" && !REGEX_META_RE.test(body) ? body : undefined;
}

const PACKAGE_IDS = Object.keys(PACKAGE_RESOURCE_PATHS) as readonly PackageResourceId[];

/** Every declared resource is resolved EAGERLY (population resolution throws on a non-ready fact) — a
 *  resource-mode proof therefore owes a real `package.json` at every declared `package-metadata` path, not
 *  just the ones the arm under test reads. Spread into every `mustFlag`/`mustPass` fixture. */
const PACKAGE_FIXTURE_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PACKAGE_RESOURCE_PATHS).map(([id, path]) => [path, `{ "name": "fixture-${id}", "private": true }\n`] as const),
);

/** A DEPENDENCY pattern (a bare, unanchored module-path pattern, so the classifier skips it) plus one live
 *  file-exact row. Deliberately BELOW `REAL_CONFIG_MIN_CANDIDATES` — dead/live PATTERN judgment is
 *  unconditional (only the RATIFIED-table reconciliation is anchor-gated), so this proof needs no filler and
 *  no real-tree RATIFIED rows to satisfy. */
function dependencyPatternConfig(pattern: string): string {
  return `module.exports = { forbidden: [{ name: "r", from: { path: [${JSON.stringify(pattern)}, "^packages/kit/src/live\\\\.ts$"] }, to: {} }] };\n`;
}

interface ClassifiedSelectors {
  readonly exact: readonly NativeGrantRow[];
  readonly skipped: readonly DepcruiseSelectorSnapshot[];
}

function classifySelectors(selectors: readonly DepcruiseSelectorSnapshot[]): ClassifiedSelectors {
  const exact: NativeGrantRow[] = [];
  const skipped: DepcruiseSelectorSnapshot[] = [];
  for (const selector of selectors) {
    const path = classifyRegex(selector.value);
    if (path === undefined) {
      skipped.push(selector);
    } else {
      exact.push({ path, owner: selector.owner, field: selector.field, position: selector.position });
    }
  }
  return { exact, skipped };
}

function reportExactRows(ctx: GatePolicyContext, exact: readonly NativeGrantRow[], exists: (path: string) => boolean, anchorOk: boolean): void {
  const findings = livenessFindings({
    exact: exact.map((row) => ({ file: CONFIG_REL, path: row.path, line: 0 })),
    exempt: EXEMPT,
    exemptAnchorFile: CONFIG_REL,
    anchorOk,
    messages: MESSAGES,
    exists,
  });
  for (const finding of findings) {
    const row = exact.find((candidate) => candidate.path === finding.token);
    const message =
      finding.message === MESSAGES.dead && row !== undefined
        ? `${MESSAGES.dead} Native selector: ${row.owner}.${row.field}[${String(row.position)}].`
        : finding.message;
    reportFinding(ctx, finding, message);
  }
}

interface PatternRowsInput {
  readonly skipped: readonly DepcruiseSelectorSnapshot[];
  readonly exists: (path: string) => boolean;
  readonly repoPaths: readonly string[];
  readonly dependencyModules: readonly string[];
  readonly anchorOk: boolean;
}

function reportPatternRows(ctx: GatePolicyContext, input: PatternRowsInput): number {
  const { skipped, exists, repoPaths, dependencyModules, anchorOk } = input;
  const backrefs = skipped.filter((row) => BACKREF_RE.test(row.value));
  const judgeable = skipped.filter((row) => !BACKREF_RE.test(row.value));
  const rows: readonly PatternRow[] = judgeable.map((row) => ({ file: CONFIG_REL, pattern: row.value, line: 0, matches: regexMatcher(row.value) }));
  const outcome = patternLivenessFindings({
    rows,
    sources: { repoPaths, dependencyModules },
    ratified: RATIFIED,
    ratifiedAnchorFile: CONFIG_REL,
    anchorOk,
    messages: PATTERN_MESSAGES,
    exists,
  });
  for (const finding of outcome.findings) {
    reportFinding(ctx, finding, finding.message);
  }
  return backrefs.length;
}

function reportBudget(ctx: GatePolicyContext, irreducibleCount: number, budgetAnchorTracked: boolean): void {
  if (!budgetAnchorTracked) {
    return;
  }
  for (const finding of irreducibleBudgetFindings(CONFIG_REL, irreducibleCount, BACKREF_BUDGET, PATTERN_MESSAGES.budgetMoved)) {
    reportFinding(ctx, finding, finding.message);
  }
}

export const gate = defineGate({
  id: "depcruise-grant-liveness",
  family: "grant-liveness",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the import-law config, the tracked corpus, and every package manifest are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "native-config", id: "depcruise" }, { kind: "tracked-files" }, ...PACKAGE_IDS.map((id) => ({ kind: "package-metadata", id }) as const)],
  message: MESSAGES.dead,
  fix:
    "delete the dead path from its `path`/`pathNot` in .dependency-cruiser.cjs. If the file MOVED, re-point " +
    "the row and re-read the rule — an import-law exemption follows a decision, not a filename. If the path " +
    "is transient by construction, add a row to EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts with its `why` + END CONDITION and a resolving `cite`.",
  create: (ctx) => ({
    evaluate: () => {
      // Every declared resource must be ACQUIRED every run (the receipt phase reds an unconsumed
      // declaration), regardless of which arms end up firing below. Population resolution already refuses a
      // non-ready declared resource before `create` ever runs, so every fact here is guaranteed "ready".
      const native = readyResourceValue(ctx.resources.nativeConfig("depcruise"));
      const repoPaths = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      const manifests = PACKAGE_IDS.map((id) => readyResourceValue(ctx.resources.packageMetadata(id)));
      const trackedSet = new Set(repoPaths);
      const exists = (path: string): boolean => trackedSet.has(path);
      const { exact, skipped } = classifySelectors(native.selectors);
      const anchorOk = native.selectors.length >= REAL_CONFIG_MIN_CANDIDATES;
      if (exact.length === 0) {
        if (anchorOk) {
          ctx.report.file(CONFIG_REL, { line: 1, column: 1, message: MSG_NO_ROWS });
        }
        return;
      }
      reportExactRows(ctx, exact, exists, anchorOk);
      const dependencyModules = dependencyModulesFromManifests(manifests.map((facts) => facts.dependencies));
      const irreducibleCount = reportPatternRows(ctx, { skipped, exists, repoPaths, dependencyModules, anchorOk });
      reportBudget(ctx, irreducibleCount, exists(BUDGET_ANCHOR));
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: "^packages/ui/src/gone\\.ts$" } }] };\n`,
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "the founding shape — a file-exact `pathNot` EXEMPTION whose file is GONE (mode B: nothing visits it, so nothing examines the promise)",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]:
          'const UI = "^packages/ui/src/";\nmodule.exports = { forbidden: [{ name: "r", from: { path: UI }, to: { pathNot: [`${UI}live\\\\.ts$`, `${UI}gone\\\\.ts$`] } }] };\n',
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "THE CODE-CONFIG CASE: both rows are TEMPLATE literals built from a const — the native loader observes the effective values, only the dead one fires, and the bare prefix const stays a skip",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: { path: [${Array.from({ length: 80 }, (_, i) => `"^packages/p${String(i)}/"`).join(", ")}] }, to: {} }] };\n`,
      },
      expect: { count: 1, messageIncludes: "ZERO file-exact rows" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: dependencyPatternConfig("node_modules/echarts/"),
        "packages/kit/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "node_modules/echarts/" },
      why: "#973 — a DEPENDENCY pattern lives on the declared dependency set, not on repo paths; UNDECLARED, it is dead exactly like a repo-path pattern with no member",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]:
          'module.exports = { extends: "./base.cjs", forbidden: [{ name: "root", from: {}, to: { pathNot: "^packages/ui/src/live\\\\.ts$" } }] };\n',
        "base.cjs": 'module.exports = { forbidden: [{ name: "base", from: {}, to: { pathNot: "^packages/ui/src/gone\\\\.ts$" } }] };\n',
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "DECLARED LIMIT — liveness judges selectors authored by the repository root config, while dependency-cruiser's public loader still loads and validates the complete `extends` chain; inherited package rules have a separate vendor lifecycle and member corpus",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: 'module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: "^packages/ui/src/live\\\\.ts$" } }] };\n',
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "a file-exact exemption whose file is on the tree — the sanctioned shape, silent",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]:
          'module.exports = { forbidden: [{ name: "r", from: { path: ["^packages/server/", "^packages/ui/src/(a|b)/", "^packages/client/src/features/[^/]+/.+$", "node_modules/(echarts|cmdk)/", "\\\\.(test|spec)\\\\.tsx?$"] }, to: {} }] };\n',
      },
      why: "DECLARED LIMIT — a prefix, an alternation, a character class, a bare node_modules fragment and an END-anchored-only suffix are all CLASSES of paths; none may be resolved as a file (the conservative direction: import law must never false-RED)",
    },
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: dependencyPatternConfig("node_modules/echarts/"),
        "packages/kit/src/live.ts": "export const live = 1;\n",
        "packages/client/package.json": '{ "name": "@orb/client", "private": true, "dependencies": { "echarts": "1.0.0" } }\n',
      },
      why: "#973 — the SAME dependency pattern is live once some tracked package.json declares the dependency",
    },
  ],
});
