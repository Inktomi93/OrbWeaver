// The SCOPED single-pass runner: `cli.ts scoped` drives the single-pass machine over a
// SUBSET of the tree — a folder glob, a package, or the git-changed set — so a dev gets incremental-safe
// verdicts for exactly the files they touched, without paying the full-tree gate load.
//
// THE FENCE: a `scopeSafety: "whole-project"` gate reconciles across the whole tree (registry/coverage/
// parity/uniqueness) — running it over a subset would misfire or give a partial verdict. So a scoped run
// runs ONLY the `incremental-safe` gates and DEFERS every whole-project gate wholesale, printing the
// deferred count + names so a scoped "clean" can never be misread as a full all-clear. Incremental-safe
// gates with a stale-registry `finalize` arm self-fence it on `scope.kind !== "project"`.
//
// THE MIXED HALF (#1584 §5): the SAME loader classifies both contracts, and the final policies run through their own
// dispatcher over the SAME Project with the scoped fileset as `requestedPaths`. The final contract's whole-project
// fence is the dispatcher's own: an `entire-population` policy under a proper subset, or a policy whose population
// never met the selection, comes back `not-applicable` and is listed in the deferred notice beside the legacy
// whole-project gates. The exit is the max of the two sides.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx, Scope } from "../contract/gate.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { ScopedPolicyResult, ScopedResult } from "../contract/scoped.ts";
import { loadMixedGateCorpus } from "../lib/loader.ts";
import { projectCtx, repoRel, runPass, stripProbeFindings, stripProbePolicyFindings } from "../lib/pass.ts";
import { FAIL_ON_WARNINGS_FLAG } from "../lib/policy-command.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { policyPassExitCode } from "../lib/policy-plan.ts";
import { renderPass, renderPolicyPass } from "../lib/render.ts";
import { gitChangedPaths } from "../lib/repo-paths.ts";
import { reviewedGrantsFor } from "../lib/reviewed-grants.ts";
import { policyReport, policyRows } from "../lib/structure-report.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts scoped --scope <folder-glob>");

const TRAILING_SLASH_RE = /\/+$/u;

interface ScopeSelection {
  readonly scope: Scope;
  /** repo-relative posix path → is this file in scope? Applied to every workspace source file. */
  readonly inScope: (rel: string) => boolean;
  /** A human label for the run header (`folder packages/ui/**`, `changed (12 files)`, …). */
  readonly label: string;
}

/** Every path under `packages/<name>/`. `--package @orb/ui` and `--package ui` both resolve to `ui`. */
function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

/** A minimal `**` glob → predicate. This is a folder-scope selector, not a full glob engine. */
function folderMatcher(glob: string): (rel: string) => boolean {
  const norm = glob.replace(TRAILING_SLASH_RE, "");
  if (norm.endsWith("/**")) {
    const prefix = `${norm.slice(0, -"/**".length)}/`;
    return (rel) => rel.startsWith(prefix);
  }
  // A trailing segment with no glob: treat as a directory prefix OR an exact file.
  return (rel) => rel === norm || rel.startsWith(`${norm}/`);
}

/** `--scope a,b` is the COMMA form (#1185): every lane types it, and before this it was fed WHOLE to
 *  `folderMatcher`, which matched no path on any tree — 0 files in scope, every gate "✓ scanned 0/0",
 *  exit 0. A false clean at the lane gate door. The form is now ACCEPTED as a union of folder globs;
 *  an empty segment (`a,`, `a,,b`) is misuse, because it is a typo and never a scope anyone means.
 *  The other half of the fix lives in `runScopedCli`: an EMPTY resolved fileset can never be green. */
function splitScopeGlobs(scope: string): readonly string[] | { readonly error: string } {
  const parts = scope.split(",").map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) {
    return { error: `--scope ${JSON.stringify(scope)} has an empty comma segment — spell each folder glob (tooling/src/verify/ops/scoped.ts)` };
  }
  return parts;
}

/** Narrow `splitScopeGlobs`'s result to its success arm. */
function isGlobList(v: readonly string[] | { readonly error: string }): v is readonly string[] {
  return Array.isArray(v);
}

function selectionFor(args: Args): ScopeSelection {
  if (args.package !== undefined) {
    const dir = packageDir(args.package);
    // @orb/tooling is a ROOT-tree workspace package (docs/architecture/core/Core-Tooling-Law.md §2.1), not packages/*.
    const prefix = dir === "tooling" ? "tooling/" : `packages/${dir}/`;
    return {
      scope: { kind: "package", name: dir },
      inScope: (rel) => rel.startsWith(prefix),
      label: `package ${dir}`,
    };
  }
  if (args.changed) {
    const paths = args.changedPaths.length > 0 ? args.changedPaths : gitChangedPaths();
    const set = new Set(paths);
    return {
      scope: { kind: "changed", paths },
      inScope: (rel) => set.has(rel),
      label: `changed (${paths.length} file${paths.length === 1 ? "" : "s"})`,
    };
  }
  // args.scope is guaranteed present by parseArgs when neither package nor changed is set, and parseArgs
  // has already refused an empty comma segment — so the split here cannot be an error object.
  const globs = args.scopeGlobs;
  const matchers = globs.map(folderMatcher);
  return {
    scope: { kind: "folder", glob: globs.join(",") },
    inScope: (rel) => matchers.some((m) => m(rel)),
    label: `folder ${globs.join(" + ")}`,
  };
}

interface Args {
  // Explicit `| undefined` (not `?:`) so parseArgs can build the object with the absent selectors set to
  // undefined under exactOptionalPropertyTypes (the flagValue result IS `string | undefined`).
  readonly scope: string | undefined;
  /** `--scope`'s comma form split into its folder globs (empty when the selector isn't --scope). */
  readonly scopeGlobs: readonly string[];
  readonly package: string | undefined;
  readonly changed: boolean;
  readonly changedPaths: readonly string[];
  /** The warning-promotion opt-in (`--fail-on-warnings`), DEFAULT FALSE — the token's one home is
   *  lib/policy-command.ts, the final-policy grammar that already owns it. */
  readonly failOnWarnings: boolean;
}

/** This verb's usage line — ONE home, read by the UsageError below and by the front door's pre-dispatch
 *  `--help` answer (cli.ts VERB_HELP, #809). */
export const SCOPED_USAGE = `usage: node tooling/src/verify/cli.ts scoped (--scope <folder-glob>[,<folder-glob>…] | --package <name> | --changed [<paths…>|git]) [${FAIL_ON_WARNINGS_FLAG}]
  --scope takes one or more comma-separated repo-relative folder globs (union). An ASSERTED selector (--scope/--package) that resolves to 0 files exits 2; a derived --changed set may legitimately be empty.
  ${FAIL_ON_WARNINGS_FLAG} promotes final \`severity: "warning"\` findings into the blocking count (exit 1). It is OFF by default: a warning is reported, counted, and blocks nothing.`;

/** Reject a selector combination that isn't exactly one non-empty selector — the first failing rule's
 *  message, or undefined when the args are well-formed. */
function validateSelectors(a: Pick<Args, "scope" | "package" | "changed">): string | undefined {
  const selectors = [a.scope !== undefined, a.package !== undefined, a.changed].filter(Boolean).length;
  const rules: ReadonlyArray<readonly [boolean, string]> = [
    [selectors !== 1, "exactly one of --scope / --package / --changed is required"],
    [a.scope !== undefined && a.scope.length === 0, "--scope needs a folder glob"],
    [a.package !== undefined && a.package.length === 0, "--package needs a package name"],
  ];
  return rules.find(([failed]) => failed)?.[1];
}

/** Parse the ONE selector. Exactly one of --scope / --package / --changed is required. Positional
 *  args after `--changed` are explicit changed paths (`git` = derive from git diff, the default). */
function parseArgs(argv: readonly string[]): Args | { readonly error: string } {
  const scope = flagValue(argv, "--scope");
  const pkg = flagValue(argv, "--package");
  const changed = argv.includes("--changed");
  const changedPaths = changed ? positionalsAfterChanged(argv) : [];
  const error = validateSelectors({ scope, package: pkg, changed });
  if (error !== undefined) {
    return { error };
  }
  const split = scope === undefined ? [] : splitScopeGlobs(scope);
  if (!isGlobList(split)) {
    return split;
  }
  const unknown = unknownToken(argv);
  if (unknown !== undefined) {
    return { error: `unrecognised argument ${JSON.stringify(unknown)}` };
  }
  return { scope, scopeGlobs: split, package: pkg, changed, changedPaths, failOnWarnings: argv.includes(FAIL_ON_WARNINGS_FLAG) };
}

/** The first token this grammar does not know. A valid SELECTOR is already established by the caller, so
 *  what is left is the tail: an extra flag, or a positional where only `--changed` admits one. Both used
 *  to be dropped in silence — `scoped --package @orb/kit --bogus-flag` ran a full scoped pass and exited
 *  0, which reads as "the flag did something" (#1117; measured red-first on this tree). */
function unknownToken(argv: readonly string[]): string | undefined {
  const unknown: string[] = [];
  let sawChanged = false;
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] as string;
    i += 1;
    if (token === "--changed") {
      sawChanged = true;
      continue;
    }
    if (token === FAIL_ON_WARNINGS_FLAG) {
      continue; // the warning-promotion opt-in; it carries no value and is legal beside any selector
    }
    if (token === "--scope" || token === "--package") {
      i += 1; // skip the selector's VALUE, whatever it is
      continue;
    }
    // After `--changed`, bare positionals are the explicit changed paths (and `git` is its sentinel).
    if (!sawChanged || token.startsWith("-")) {
      unknown.push(token);
    }
  }
  return unknown[0];
}

/** The value immediately following `flag`, or undefined if the flag is absent. */
function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

/** Explicit changed paths: every positional after `--changed` that isn't a flag or the `git` sentinel. */
function positionalsAfterChanged(argv: readonly string[]): string[] {
  const start = argv.indexOf("--changed") + 1;
  return argv.slice(start).filter((a) => a !== "git" && !a.startsWith("--"));
}

/** Split the loaded gates by the scope-safety axis. */
function partitionGates(gates: readonly GateDescriptor[]): {
  readonly incremental: readonly GateDescriptor[];
  readonly deferred: readonly GateDescriptor[];
} {
  const incremental: GateDescriptor[] = [];
  const deferred: GateDescriptor[] = [];
  for (const g of gates) {
    if (g.status !== "active") {
      continue; // dormant gates don't run in either mode
    }
    (g.scopeSafety === "whole-project" ? deferred : incremental).push(g);
  }
  return { incremental, deferred };
}

/** The deferred-gate notice: a scoped clean is NOT a full all-clear. Names every whole-project legacy gate and
 *  every final policy the dispatcher declined (entire-population under a subset, or an empty intersection) so the
 *  dev knows exactly what still needs the full run. */
function renderDeferredNotice(deferred: readonly GateDescriptor[], deferredFinal: readonly GatePolicy[]): string {
  if (deferred.length + deferredFinal.length === 0) {
    return "";
  }
  const names = [...deferred.map((g) => `${g.name} (legacy whole-project)`), ...deferredFinal.map((p) => `${p.id} (final ${p.execution})`)].sort();
  const lines = [
    "",
    `  ⚠ ${names.length} gate(s) DEFERRED — a scoped run does NOT judge cross-file`,
    "    (registry/coverage/parity/uniqueness) rules. Run the full `pnpm check` before pushing:",
  ];
  for (const name of names) {
    lines.push(`      · ${name}`);
  }
  return lines.join("\n");
}

/** The project's source files the selection accepts. ONE home for the scoped fileset, so the CLI's
 *  empty-scope refusal (#1185) and the pass itself can never disagree about what "in scope" means. */
function scopedFiles(base: Pick<GateRunCtx, "root" | "project">, inScope: (rel: string) => boolean): SourceFile[] {
  return base.project.getSourceFiles().filter((sf) => inScope(repoRel(base.root, sf.getFilePath())));
}

/** The pure scoping core: partition the gates by scope-safety, filter the project's source files to
 *  those the selection accepts, and run ONLY the incremental-safe gates over that fileset. The
 *  whole-project gates are returned as `deferred`, never run. */
export function runScopedPass(
  gates: readonly GateDescriptor[],
  base: Omit<GateRunCtx, "report" | "scan">,
  selection: Pick<ScopeSelection, "scope" | "inScope">,
): ScopedResult {
  const { incremental, deferred } = partitionGates(gates);
  const files = scopedFiles(base, selection.inScope);
  const rawPass = runPass(incremental, { ...base, scope: selection.scope, files });
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);
  return { pass, deferred, files: files.length };
}

/** The FINAL half of a scoped run: every final policy through the production dispatcher over the SAME Project, the
 *  scoped fileset as `requestedPaths` and the FULL roster as `knownPolicies`. The dispatcher's own fence decides
 *  what runs — a `not-applicable` owner is the deferred list, never a policy this door filtered by hand.
 *
 *  `failOnWarnings` arrives from the operator's `--fail-on-warnings` and DEFAULTS FALSE: a final
 *  `severity: "warning"` finding is reported, counted in `verdict.warnings`, and blocks nothing. */
function runScopedPolicyPass(
  policies: readonly GatePolicy[],
  base: Omit<GateRunCtx, "report" | "scan">,
  files: readonly SourceFile[],
  failOnWarnings: boolean,
): ScopedPolicyResult {
  if (policies.length === 0) {
    return { pass: null, deferred: [] };
  }
  const raw = runPolicyPass({
    knownPolicies: policies,
    policies,
    root: base.root,
    project: base.project,
    requestedPaths: files.map((sf) => repoRel(base.root, sf.getFilePath())),
    reviewedGrants: reviewedGrantsFor(policies),
    failOnWarnings,
  });
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? raw : stripProbePolicyFindings(raw);
  const declined = new Set(pass.policies.filter(({ owner }) => owner.status === "not-applicable").map(({ id }) => id));
  return { pass, deferred: policies.filter(({ id }) => declined.has(id)) };
}

/** The EMPTY-SCOPE notice (#1185). ONE home so the pin reads the tool's own words. A scoped run over zero
 *  files is not a clean bill of health: every gate prints `✓ scanned 0/0` and the run exits 0, which at
 *  the lane gate door reads as "my slice passed" (.claude/rules/gates-and-tooling.md: a bare zero is
 *  "I couldn't measure", never "it isn't there").
 *
 *  THE SELECTOR DECIDES THE EXIT CODE, and the split is deliberate (stated fork, #1185):
 *   • `--scope` / `--package` ASSERT a fileset. Zero files means the operator's assertion was wrong —
 *     a typo'd path, a moved folder, the comma form this issue was filed about. Exit 2: nothing was
 *     checked, and the run is not a verdict.
 *   • `--changed` DERIVES its set from git. Zero source files there is an ordinary, correct state (a
 *     docs-only or config-only diff), so failing it would mint exactly the false alarm this fix is
 *     about. It prints the same "nothing was checked" line and exits CLEAN — honest, not fatal. */
function emptyScopeNotice(label: string, fatal: boolean): string {
  const head = fatal ? "SCOPE ERROR  scoped 0 files — nothing was checked" : "SCOPE EMPTY  scoped 0 files — nothing was checked";
  const tail = fatal
    ? [
        "  Every gate would have printed `✓ scanned 0/0`; that is not a verdict, so this run exits 2.",
        "  Check the path spelling (repo-relative, e.g. packages/ui/src/primitives/switch); several folders",
        "  are comma-separated (`--scope a,b`) — see tooling/src/verify/ops/scoped.ts.",
      ]
    : [
        "  The changed set holds no source file the gates can read (a docs/config-only diff). No gate ran, so",
        "  this run judged nothing — see tooling/src/verify/ops/scoped.ts.",
      ];
  return [`${head} (${label}).`, ...tail].join("\n");
}

/** The `scoped` verb: parse the ONE selector, run the incremental-safe gates over the selected fileset,
 *  print the pass + the deferred notice, and RETURN the verdict (the cli's runTool owns the exit — a bare
 *  process.exit here would drop the buffered render). A bad selector is a UsageError → exit 3; a selector
 *  that resolves to NO files is exit 2 (#1185), refused BEFORE the gates run so no green wall is printed. */
export async function runScopedCli(root: string, argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    throw new UsageError(`${parsed.error}\n${SCOPED_USAGE}`);
  }
  const selection = selectionFor(parsed);
  const base = projectCtx(root);
  if (scopedFiles(base, selection.inScope).length === 0) {
    const asserted = selection.scope.kind !== "changed";
    process.stderr.write(`${emptyScopeNotice(selection.label, asserted)}\n`);
    return asserted ? EXIT.toolError : EXIT.clean;
  }
  const corpus = await loadMixedGateCorpus(root);
  const gates = corpus.legacy;
  const { pass, deferred, files } = runScopedPass(gates, base, selection);
  const final = runScopedPolicyPass(corpus.final, base, scopedFiles(base, selection.inScope), parsed.failOnWarnings);

  process.stdout.write(`check:scope — ${selection.label} · ${files} file(s) in scope\n\n`);
  process.stdout.write(renderPass(pass, new Map(gates.map((g) => [g.name, g]))));
  if (final.pass !== null) {
    // The declined owners are the deferred notice's business, not ⚠ rows.
    const rows = policyRows(final.pass, corpus.final).filter((row) => row.owner.status !== "not-applicable");
    process.stdout.write(`\n${renderPolicyPass(rows, policyReport(final.pass), corpus.final)}`);
  }
  process.stdout.write(`${renderDeferredNotice(deferred, final.deferred)}\n`);

  const violations = pass.gates.reduce((n, g) => n + g.findings.length, 0);
  const finalExit = final.pass === null ? EXIT.clean : policyPassExitCode(final.pass);
  // A thrown gate or a refused final owner — the checker is broken — outranks a verdict on either side.
  return Math.max(legacyExit(pass.toolErrors.length, violations), finalExit);
}

function legacyExit(toolErrors: number, violations: number): number {
  if (toolErrors > 0) {
    return EXIT.toolError;
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}
