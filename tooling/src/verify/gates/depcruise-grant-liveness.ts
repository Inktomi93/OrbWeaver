// Gate: depcruise-grant-liveness — a FILE-EXACT path in a `.dependency-cruiser.cjs` rule's `path`/`pathNot`
// names ONE file: a `pathNot` is an EXEMPTION (this one file may cross the boundary), a `path` is the rule's
// own subject. Either way, when that file is deleted or moved the row goes SILENTLY dead — an exemption
// nobody can see, or a rule aimed at nothing — and the next file created at that path inherits an import-law
// posture nobody re-approved. biome-grant-liveness's shape (tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B) on the import-law
// config. TWO hard parts, and why this is its own policy: (1) the values are CODE, so observation runs the
// executable config through dependency-cruiser's public loader via the `native-config` ResourceHost fact;
// imported, called, spread and template-derived selectors retain their runtime values. Liveness judges the
// repository-authored root config only: `extends` package rules have a vendor lifecycle and member sources
// this repo does not own; the public loader still proves that the complete effective chain loads. (2) the
// values are REGEX SOURCE, not globs, so a path is only recognised when the pattern is FULLY ANCHORED
// (`^…$`) and carries no surviving metacharacter after unescaping `\.`/`\/`. That classifier is deliberately
// CONSERVATIVE in the direction that matters: these lists are load-bearing import law, so an ambiguous
// pattern becomes a declared SKIP, never a RED. Arms: DEAD · DEAD-PATTERN · NO-ROWS (the §4.6 blindness
// tripwire) · the irreducible BACKREF BUDGET. MISSING/UNPARSEABLE-CONFIG are
// no longer a reportable arm of THIS policy: a `native-config` resource that cannot resolve makes population
// resolution itself throw (`resolveResourceDeclarations`), which withholds the whole run as a TOOL ERROR —
// the fail-LOUD requirement is now the runtime's own refusal, proven at `runPolicyPass` level, not by a
// `mustFlag` row (the proof harness has no "expect a tool error" arm — see the permanent-pin test).
// PATTERN LIVENESS (#973). The rows the file-exact classifier skips are no longer invisible. A pattern is
// LIVE when it matches at least one member of a FINITE tracked source — the `tracked-files` ResourceHost
// fact, or the declared-dependency module paths derived from every `package-metadata` fact (dep-cruiser
// matches MODULE paths, so `node_modules/echarts/` is live exactly while some package.json still declares
// echarts). Zero members in either = the same loaded-gun class one level up: import law aimed at nothing, or
// an exemption for a class that no longer exists. One family cannot be judged at all and carries a no-growth
// BUDGET instead: a `$1` BACKREFERENCE, whose member set is bound by the paired rule's capture at cruise
// time rather than by the tree.
//
// AUTHORITY — REVIEWED GRANT, MIGRATED FROM TWO GATE-LOCAL TABLES (#1922 / #2147, closed by #2176 Phase F).
// This policy was the LAST of the four config-liveness siblings still `hard` with its own `ExemptionTable`s:
// an empty `EXEMPT` for the file-exact arm and a three-row `RATIFIED` for the pattern arm, plus two in-policy
// arms policing those tables (STALE: the config no longer carries the row; DEAD-CITE: the row's `cite` stopped
// resolving). §5 forbids a gate-owned exemption table, so the three rows are now exact
// `(policy, subject, operation)` rows in `lib/reviewed-grants.ts` and this policy reports EVERY dead row. The
// identity keeps both halves of each retired row, exactly as `eslint-grant-liveness` does one config over:
//   · SUBJECT = the positional selector identity (`config.options.exclude.path[0]`) — the authored coordinate.
//   · OPERATION = `depcruise-dead-exact:<JSON path>` or `depcruise-zero-member-pattern:<JSON pattern>`, so a
//     grant binds the VALUE it reviewed and never whatever later occupies the same position.
//   · STALE → central `stale-reviewed-grant` (zero consumption after a complete owner run). Stronger: a module
//     cannot forget it.
//   · DEAD-CITE → NO SUCCESSOR, the retired property `biome-grant-liveness` and `eslint-grant-liveness` both
//     record. Each grant's `why` carries its former cite path verbatim for the successor citation check (#2349):
//     `dist` → `.gitignore`; `quickjs-wasm-url` →
//     `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts`.
// MEASURED at the conversion (2026-09-14, `pnpm check:structure --check depcruise-grant-liveness`): the three
// formerly hidden patterns became `raw 3 = waived 0 + granted 3 + effective 0`, 0 alarms — one grant per
// finding, which is the §6.4 EXEMPTION-MECHANISM MOVE receipt. The POPULATION and resource declarations are
// unchanged.
// COMMENT POSTURE: comment-SAFE — observation reads runtime config values, never source text.
import type { DepcruiseConfigSnapshotField, DepcruiseSelectorSnapshot } from "../contract/config-snapshot.ts";
import type { GrantFinding } from "../contract/grant-liveness.ts";
import type { GatePolicyContext, GatePolicyFileFindingDetails } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { PackageResourceId } from "../contract/resource-config.ts";
import { PACKAGE_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { PatternLivenessMessages, PatternRow } from "../lib/grant-liveness.ts";
import { deadExactFindings, dependencyModulesFromManifests, irreducibleBudgetFindings, patternLivenessFindings } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
/** Regex metacharacters that make a pattern a CLASS of paths rather than one file. A pattern still carrying
 *  any of these after anchor-stripping and `\.`/`\/` unescaping is a declared skip, never a judged row. */
const REGEX_META_RE = /[|()[\]{}*+?^$\\]/u;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real config derives far more values across its
 *  rules; a resource proof plants a handful. Counted over ALL derived values, never over the exact ones, so
 *  it can guard the very arm that judges the regex/literal classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 80;

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

const PATTERN_MESSAGES: PatternLivenessMessages = {
  deadPattern:
    "a PATTERN in .dependency-cruiser.cjs matches NOTHING this repo carries — no tracked file and no " +
    "declared dependency is inside it. Import law aimed at an empty set enforces nothing, and a `pathNot` " +
    "over an empty set is an exemption nobody can see being over-broad (the loaded-gun class one level up " +
    "from a dead file-exact row, tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). Re-point the " +
    "pattern at the tier/package it means, delete the rule, or — if its members genuinely cannot be " +
    "enumerated from the tree — it is a REVIEWED GRANT: add a row to " +
    "tooling/src/verify/lib/reviewed-grants.ts keyed on this policy id, the finding's subject and its " +
    "operation, with its `why` and its `endsWhen`. The finding TOKEN is the positional selector identity " +
    "(a regex source carries parentheses, which no @orb-waive position may name); the pattern itself is in " +
    "this message and in the grant operation.",
  // The two RATIFIED arms are unreachable by construction now (`ratified: {}`, `anchorOk: false`) and
  // their successors are central: STALE -> `stale-reviewed-grant` (zero consumption after a complete
  // owner run, which cannot be forgotten by a module); DEAD-CITE -> NO SUCCESSOR, the same retired
  // property `biome-grant-liveness` and `eslint-grant-liveness` record, with each grant's `why` carrying
  // its former cite path verbatim for the successor citation check (#2349). The shared core keeps the two
  // keys until its last legacy replay retires with the runtime (#2176 commit 3).
  staleRatified: "",
  deadCite: "",
  budgetMoved:
    "the count of IRREDUCIBLE `$1`-backreference patterns in .dependency-cruiser.cjs is {actual}, but the " +
    "committed budget is {budget}. These are the rows whose member set dep-cruiser binds from the paired " +
    "rule's capture at cruise time, so no static reader can test them — the budget is what keeps that " +
    "population from growing silently. GROWTH: justify the new pair or express it without a capture. " +
    "SHRINK: commit it, by lowering BACKREF_BUDGET in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
};

const MSG_DEAD =
  "a FILE-EXACT `path`/`pathNot` in .dependency-cruiser.cjs names nothing on the tree — the import-law row " +
  "it carries is DEAD. A `pathNot` exemption whose subject was deleted is an over-grant nobody can see (and " +
  "the next file created at that path silently inherits it); a `path` subject that resolves to nothing is a " +
  "rule aimed at no file at all. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B. The finding " +
  "token is the dead path.";

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

/** THE LICENSED ACT. The authored selector value is part of the OPERATION, so a grant binds the value it
 *  reviewed and never whatever later occupies the same position — `eslint-grant-liveness`' identity, one
 *  config over. Two operations because the two arms review different things: a FILE-EXACT row promises one
 *  named file, a PATTERN promises a class. */
const OPERATION_EXACT = "depcruise-dead-exact:";
const OPERATION_PATTERN = "depcruise-zero-member-pattern:";

/** The positional identity — the finding token's home in the executable config. EXPORTED so the permanent
 *  pin speaks the same identity language instead of re-deriving `owner.field[position]`. */
export function selectorIdentity(row: Pick<DepcruiseSelectorSnapshot, "owner" | "field" | "position">): string {
  return `${row.owner}.${row.field}[${String(row.position)}]`;
}

interface GrantIdentity {
  readonly subject: string;
  readonly operation: string;
}

/** Map a shared-core `GrantFinding` (file/line/column/token?/message?) onto the final contract's
 *  `report.file`, never handing `exactOptionalPropertyTypes` an explicit `token: undefined`. An arm that
 *  can be licensed passes its `(subject, operation)`; the BUDGET arm cannot and passes none. */
function reportFinding(ctx: GatePolicyContext, finding: GrantFinding, message?: string, identity?: GrantIdentity): void {
  const base: GatePolicyFileFindingDetails = { line: 1, column: 1 };
  const withMessage: GatePolicyFileFindingDetails = message === undefined ? base : { ...base, message };
  const withIdentity: GatePolicyFileFindingDetails = identity === undefined ? withMessage : { ...withMessage, ...identity };
  ctx.report.file(finding.file, finding.token === undefined ? withIdentity : { ...withIdentity, token: finding.token });
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

function reportExactRows(ctx: GatePolicyContext, exact: readonly NativeGrantRow[], exists: (path: string) => boolean): void {
  const findings = deadExactFindings({
    exact: exact.map((row) => ({ file: CONFIG_REL, path: row.path, line: 0 })),
    message: MSG_DEAD,
    exists,
  });
  for (const finding of findings) {
    const row = exact.find((candidate) => candidate.path === finding.token);
    if (row === undefined) {
      reportFinding(ctx, finding, finding.message);
      continue;
    }
    const subject = selectorIdentity(row);
    const operation = `${OPERATION_EXACT}${JSON.stringify(row.path)}`;
    reportFinding(ctx, finding, `${MSG_DEAD} Subject: ${subject}, operation: ${operation}.`, { subject, operation });
  }
}

interface PatternRowsInput {
  readonly skipped: readonly DepcruiseSelectorSnapshot[];
  readonly repoPaths: readonly string[];
  readonly dependencyModules: readonly string[];
}

function reportPatternRows(ctx: GatePolicyContext, input: PatternRowsInput): number {
  const { skipped, repoPaths, dependencyModules } = input;
  const backrefs = skipped.filter((row) => BACKREF_RE.test(row.value));
  const judgeable = skipped.filter((row) => !BACKREF_RE.test(row.value));
  const rows: readonly PatternRow[] = judgeable.map((row) => ({ file: CONFIG_REL, pattern: row.value, line: 0, matches: regexMatcher(row.value) }));
  const outcome = patternLivenessFindings({
    rows,
    sources: { repoPaths, dependencyModules },
    // No gate-owned allowance survives: every zero-member pattern is REPORTED and the central table
    // licenses the three whose members are genuinely not enumerable. `anchorOk: false` makes the core's
    // two ratified arms unreachable rather than merely empty, matching the converted siblings.
    ratified: {},
    ratifiedAnchorFile: CONFIG_REL,
    anchorOk: false,
    messages: PATTERN_MESSAGES,
  });
  for (const finding of outcome.findings) {
    const row = judgeable.find((candidate) => candidate.value === finding.token);
    if (row === undefined) {
      reportFinding(ctx, finding, finding.message);
      continue;
    }
    const subject = selectorIdentity(row);
    const operation = `${OPERATION_PATTERN}${JSON.stringify(row.value)}`;
    // THE TOKEN IS THE POSITIONAL IDENTITY, NOT THE PATTERN (#2176), and the runtime is what taught it: a
    // dep-cruiser pattern is REGEX SOURCE, and a pattern carrying regex punctuation is spellable nowhere in
    // the ordinary-waiver position grammar, which makes the finding permanently unnameable. The dispatcher
    // REFUSES such a token and withholds the owner. MEASURED VERBATIM on the example that taught it — since
    // retired at #2176 Phase F with the `__g_` sentinel itself — as `finding token "(^|/)__g_" cannot be
    // named by an ordinary-waiver marker`; the class is every punctuated pattern, not that one row. `eslint-grant-liveness` already reports its positional identity as the
    // token for the same reason; the pattern stays in the MESSAGE and in the grant OPERATION, where it is
    // the value a review actually binds.
    reportFinding(ctx, { ...finding, token: subject }, `${PATTERN_MESSAGES.deadPattern} Subject: ${subject}, operation: ${operation}.`, {
      subject,
      operation,
    });
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
  authority: "reviewed-grant",
  severity: "error",
  population: { of: "none", why: "the import-law config, the tracked corpus, and every package manifest are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "native-config", id: "depcruise" }, { kind: "tracked-files" }, ...PACKAGE_IDS.map((id) => ({ kind: "package-metadata", id }) as const)],
  message: MSG_DEAD,
  fix:
    "delete the dead path from its `path`/`pathNot` in .dependency-cruiser.cjs. If the file MOVED, re-point " +
    "the row and re-read the rule — an import-law exemption follows a decision, not a filename. If the path " +
    "is absent BY CONSTRUCTION, it is a REVIEWED GRANT: add a row to " +
    "tooling/src/verify/lib/reviewed-grants.ts keyed on this policy id, the finding's subject and its " +
    "operation, with its `why` and its `endsWhen`.",
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
        // THE BLINDNESS TRIPWIRE IS A REFUSAL, NOT A FINDING (#2176, at the reviewed-grant conversion).
        // Every finding of a reviewed-grant policy owes a `(subject, operation)` a central row could name
        // — and a blindness alarm is the ONE verdict that must never be grantable, because granting it
        // would license the gate to stop measuring. So it raises, which withholds the owner as a TOOL
        // ERROR (exit 2): the run is not a verdict, which is exactly what the alarm says. Same move the
        // MISSING/UNPARSEABLE-CONFIG arm already made in this file, now proven by a `mustRefuse` row.
        if (anchorOk) {
          throw new Error(MSG_NO_ROWS);
        }
        return;
      }
      reportExactRows(ctx, exact, exists);
      const dependencyModules = dependencyModulesFromManifests(manifests.map((facts) => facts.dependencies));
      const irreducibleCount = reportPatternRows(ctx, { skipped, repoPaths, dependencyModules });
      reportBudget(ctx, irreducibleCount, exists(BUDGET_ANCHOR));
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "config.forbidden[0].to.pathNot[0]", operation: 'depcruise-dead-exact:"packages/ui/src/gone.ts"' },
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: "^packages/ui/src/gone\\.ts$" } }] };\n`,
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "the founding shape — a file-exact `pathNot` EXEMPTION whose file is GONE (mode B: nothing visits it, so nothing examines the promise). The grant witness binds its exact (positional selector, authored path) pair, so a review can license this arm and nothing else",
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
        [CONFIG_REL]: dependencyPatternConfig("node_modules/echarts/"),
        "packages/kit/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config.forbidden[0].from.path[0]", messageIncludes: 'operation: depcruise-zero-member-pattern:"node_modules/echarts/"' },
      why: "#973 — a DEPENDENCY pattern lives on the declared dependency set, not on repo paths; UNDECLARED, it is dead exactly like a repo-path pattern with no member",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        ...PACKAGE_FIXTURE_FILES,
        [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: { path: [${Array.from({ length: 80 }, (_, i) => `"^packages/p${String(i)}/"`).join(", ")}] }, to: {} }] };\n`,
      },
      expect: { messageIncludes: "ZERO file-exact rows were derived from an anchor-sized value set" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire. It REFUSES rather than reporting (#2176): a reviewed-grant finding owes an identity a central row could name, and a blindness alarm is the one verdict that must never be grantable. The substring is this policy's own sentence, not the generic refusal envelope",
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
