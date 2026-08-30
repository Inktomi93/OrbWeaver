// The SCOPED single-pass runner: `cli.ts scoped` drives the single-pass machine over a
// SUBSET of the tree — a folder glob, a package, or the git-changed set — so a dev gets incremental-safe
// verdicts for exactly the files they touched, without paying the full-tree gate load.
//
// THE FENCE: a `scopeSafety: "whole-project"` gate reconciles across the whole tree (registry/coverage/
// parity/uniqueness) — running it over a subset would misfire or give a partial verdict. So a scoped run
// runs ONLY the `incremental-safe` gates and DEFERS every whole-project gate wholesale, printing the
// deferred count + names so a scoped "clean" can never be misread as a full all-clear. Incremental-safe
// gates with a stale-registry `finalize` arm self-fence it on `scope.kind !== "project"`.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx, Scope } from "../contract/gate.ts";
import type { ScopedResult } from "../contract/scoped.ts";
import { loadGates } from "../lib/loader.ts";
import { projectCtx, repoRel, runPass, stripProbeFindings } from "../lib/pass.ts";
import { renderPass } from "../lib/render.ts";
import { gitChangedPaths } from "../lib/repo-paths.ts";

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
  // args.scope is guaranteed present by parseArgs when neither package nor changed is set.
  const glob = args.scope ?? "";
  return {
    scope: { kind: "folder", glob },
    inScope: folderMatcher(glob),
    label: `folder ${glob}`,
  };
}

interface Args {
  // Explicit `| undefined` (not `?:`) so parseArgs can build the object with the absent selectors set to
  // undefined under exactOptionalPropertyTypes (the flagValue result IS `string | undefined`).
  readonly scope: string | undefined;
  readonly package: string | undefined;
  readonly changed: boolean;
  readonly changedPaths: readonly string[];
}

/** This verb's usage line — ONE home, read by the UsageError below and by the front door's pre-dispatch
 *  `--help` answer (cli.ts VERB_HELP, #809). */
export const SCOPED_USAGE = "usage: node tooling/src/verify/cli.ts scoped (--scope <folder-glob> | --package <name> | --changed [<paths…>|git])";

/** Reject a selector combination that isn't exactly one non-empty selector — the first failing rule's
 *  message, or undefined when the args are well-formed. */
function validateSelectors(a: Args): string | undefined {
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
  const args: Args = { scope, package: pkg, changed, changedPaths };
  const error = validateSelectors(args);
  return error === undefined ? args : { error };
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

/** The deferred-gate notice: a scoped clean is NOT a full all-clear. Names every whole-project gate
 *  that was skipped so the dev knows exactly what still needs the full run. */
function renderDeferredNotice(deferred: readonly GateDescriptor[]): string {
  if (deferred.length === 0) {
    return "";
  }
  const names = deferred.map((g) => g.name).sort();
  const lines = [
    "",
    `  ⚠ ${deferred.length} whole-project gate(s) DEFERRED — a scoped run does NOT judge cross-file`,
    "    (registry/coverage/parity/uniqueness) rules. Run the full `pnpm check` before pushing:",
  ];
  for (const name of names) {
    lines.push(`      · ${name}`);
  }
  return lines.join("\n");
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
  const files: SourceFile[] = base.project.getSourceFiles().filter((sf) => selection.inScope(repoRel(base.root, sf.getFilePath())));
  const rawPass = runPass(incremental, { ...base, scope: selection.scope, files });
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);
  return { pass, deferred, files: files.length };
}

/** The CLI path: build the real full workspace, then scope it. */
function runScoped(gates: readonly GateDescriptor[], root: string, selection: Pick<ScopeSelection, "scope" | "inScope">): ScopedResult {
  return runScopedPass(gates, projectCtx(root), selection);
}

/** The `scoped` verb: parse the ONE selector, run the incremental-safe gates over the selected fileset,
 *  print the pass + the deferred notice, and RETURN the verdict (the cli's runTool owns the exit — a bare
 *  process.exit here would drop the buffered render). A bad selector is a UsageError → exit 3. */
export async function runScopedCli(root: string, argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    throw new UsageError(`${parsed.error}\n${SCOPED_USAGE}`);
  }
  const selection = selectionFor(parsed);
  const gates = await loadGates(root);
  const { pass, deferred, files } = runScoped(gates, root, selection);

  process.stdout.write(`check:scope — ${selection.label} · ${files} file(s) in scope\n\n`);
  process.stdout.write(renderPass(pass, new Map(gates.map((g) => [g.name, g]))));
  process.stdout.write(`${renderDeferredNotice(deferred)}\n`);

  const violations = pass.gates.reduce((n, g) => n + g.findings.length, 0);
  if (pass.toolErrors.length > 0) {
    return EXIT.toolError; // a gate threw — the checker is broken
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}
