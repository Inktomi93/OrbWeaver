// The SCOPED single-pass runner: `pnpm check:scope` drives the ts-morph single-pass machine (loader →
// pass → render) over a SUBSET of the tree — a folder glob, a package, or the git-changed set — so a dev
// gets the incremental-safe structural verdicts for exactly the files they touched, without the ~1s
// full-tree gate load being spent judging files they didn't. This DRIVES the single-pass path for real
// (TSMORPH-SINGLE-PASS-AUDIT.md §4); it is NOT the live pre-push gate (harness.ts keeps exit authority
// until the owner's cutover step) — it is the invocable proof that the scope axis works end-to-end.
//
// THE FENCE (§4.4, the correctness heart): a `scopeSafety: "whole-project"` gate reconciles across the
// WHOLE tree (registry/coverage/parity/uniqueness) — running it over a subset would either misfire or
// give a partial, misleading verdict. So a scoped run RUNS ONLY the `incremental-safe` gates over the
// scoped fileset and DEFERS every whole-project gate wholesale — and PRINTS the deferred count + names,
// so a scoped "clean" can NEVER be misread as a full "all clear". The incremental-safe gates that carry a
// stale-registry `finalize` arm self-fence it on `scope.kind !== "project"` (they saw `visit` for the
// scoped files, but their whole-tree stale claim is only sound on the full run).
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { SourceFile } from "ts-morph";
import type { GateDescriptor, GateRunCtx, Scope } from "./contract.ts";
import { loadGates } from "./loader.ts";
import type { PassResult } from "./pass.ts";
import { projectCtx, repoRel, runPass } from "./pass.ts";
import { renderPass } from "./render.ts";

const TRAILING_SLASH_RE = /\/+$/u;

type ScopeSelection = {
  readonly scope: Scope;
  /** repo-relative posix path → is this file in scope? Applied to every workspace source file. */
  readonly inScope: (rel: string) => boolean;
  /** A human label for the run header (`folder packages/ui/**`, `changed (12 files)`, …). */
  readonly label: string;
};

/** Every path under `packages/<name>/`. `--package @orb/ui` and `--package ui` both resolve to `ui`. */
function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

/** The git-changed set: `git diff --name-only HEAD` (staged + unstaged vs HEAD), repo-relative posix. */
function gitChangedPaths(root: string): readonly string[] {
  const res = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`git diff failed: ${res.stderr?.trim() ?? "unknown error"}`);
  }
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** A minimal `**` glob → predicate. `packages/ui/**` matches any path under `packages/ui/`; a bare
 *  prefix with no `**` matches that prefix. This is a folder-scope selector, not a full glob engine. */
function folderMatcher(glob: string): (rel: string) => boolean {
  const norm = glob.replace(TRAILING_SLASH_RE, "");
  if (norm.endsWith("/**")) {
    const prefix = `${norm.slice(0, -"/**".length)}/`;
    return (rel) => rel.startsWith(prefix);
  }
  // A trailing segment with no glob: treat as a directory prefix OR an exact file.
  return (rel) => rel === norm || rel.startsWith(`${norm}/`);
}

function selectionFor(args: Args, root: string): ScopeSelection {
  if (args.package !== undefined) {
    const dir = packageDir(args.package);
    const prefix = `packages/${dir}/`;
    return {
      scope: { kind: "package", name: dir },
      inScope: (rel) => rel.startsWith(prefix),
      label: `package ${dir}`,
    };
  }
  if (args.changed) {
    const paths = args.changedPaths.length > 0 ? args.changedPaths : gitChangedPaths(root);
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

type Args = {
  // Explicit `| undefined` (not `?:`) so parseArgs can build the object with the absent selectors set to
  // undefined under exactOptionalPropertyTypes (the flagValue result IS `string | undefined`).
  readonly scope: string | undefined;
  readonly package: string | undefined;
  readonly changed: boolean;
  readonly changedPaths: readonly string[];
};

const USAGE =
  // biome-ignore lint/security/noSecrets: a CLI usage string (the long dashed flag run trips the entropy heuristic), not a secret.
  "usage: pnpm check:scope (--scope <folder-glob> | --package <name> | --changed [<paths…>|git])";

/** Reject a selector combination that isn't exactly one non-empty selector — the first failing rule's
 *  message, or undefined when the args are well-formed. */
function validateSelectors(a: Args): string | undefined {
  const selectors = [a.scope !== undefined, a.package !== undefined, a.changed].filter(
    Boolean,
  ).length;
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

/** The deferred-gate notice — the CRUCIAL UX: a scoped clean is NOT a full all-clear. Names every
 *  whole-project gate that was skipped so the dev knows exactly what still needs the full run. */
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

export type ScopedResult = {
  readonly pass: PassResult;
  readonly deferred: readonly GateDescriptor[];
  readonly files: number;
};

/** The pure scoping core (exported for the proof tests): partition the gates by scope-safety, filter the
 *  project's source files to those the selection accepts, and run ONLY the incremental-safe gates over
 *  that fileset under the non-`project` scope (so their stale `finalize` arms self-fence). The
 *  whole-project gates are returned as `deferred`, never run. `base` is the run context (a real full
 *  workspace on the CLI path; an in-memory one in the tests). */
export function runScopedPass(
  gates: readonly GateDescriptor[],
  base: Omit<GateRunCtx, "report">,
  selection: Pick<ScopeSelection, "scope" | "inScope">,
): ScopedResult {
  const { incremental, deferred } = partitionGates(gates);
  const files: SourceFile[] = base.project
    .getSourceFiles()
    .filter((sf) => selection.inScope(repoRel(base.root, sf.getFilePath())));
  const pass = runPass(incremental, { ...base, scope: selection.scope, files });
  return { pass, deferred, files: files.length };
}

/** The CLI path: build the real full workspace, then scope it. */
function runScoped(
  gates: readonly GateDescriptor[],
  root: string,
  selection: Pick<ScopeSelection, "scope" | "inScope">,
): ScopedResult {
  return runScopedPass(gates, projectCtx(root), selection);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n${USAGE}\n`);
    process.exit(2); // bad args — the run never happened
  }
  const root = process.cwd();
  const selection = selectionFor(parsed, root);
  const gates = await loadGates(root);
  const { pass, deferred, files } = runScoped(gates, root, selection);

  process.stdout.write(`check:scope — ${selection.label} · ${files} file(s) in scope\n\n`);
  process.stdout.write(renderPass(pass, new Map(gates.map((g) => [g.name, g]))));
  process.stdout.write(`${renderDeferredNotice(deferred)}\n`);

  const violations = pass.gates.reduce((n, g) => n + g.findings.length, 0);
  if (pass.toolErrors.length > 0) {
    process.exit(2); // a gate threw — the checker is broken
  }
  if (violations > 0) {
    process.exit(1);
  }
}

// Direct-run guard (the report.ts/run.ts idiom): `pnpm check:scope` runs main(); an import (the tests)
// gets only the exported `runScoped` core — importing this module must NOT execute a run.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
