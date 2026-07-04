// The scoped mid-tier runner: `pnpm check:file <path...>` — everything `pnpm check` would say
// about the given file(s), minutes faster, by scoping each tool to what the touched paths can
// actually affect:
//   • biome      — all given files (concise, errors-only; unmatched kinds are silently fine).
//   • eslint     — only the lint:eslint surface (packages/{ui,client,server,kit,db,contracts} +
//                  tests/ui + tests/client, .ts/.tsx), --cache under .cache/eslint/ (gitignored).
//   • tsc        — the OWNING project per file (a file-scoped tsc is unsound — it never sees the
//                  file's consumers — so we run the whole owning package, which is the smallest
//                  honest program): packages/<pkg>/src → that package's tsconfig; the @orb/ui
//                  reach-back browser-test trees → packages/ui; tests/ + scripts/ → the root
//                  aggregator. Incremental state = each tsconfig's OWN tsBuildInfoFile
//                  (node_modules/.cache/tsbuildinfo.json via tsconfig.base.json) — the same cache
//                  `pnpm typecheck` warms; a separate .cache/tsc/ would just double the state.
//   • depcruise  — packages/ TS/JS only (same guard as the PostToolUse hook).
//   • structure  — the report.ts gates whose scan roots intersect the touched paths (GATE_SCOPES
//                  below, derived from each gate's actual roots). Gates + harness are imported
//                  LAZILY so a run where no gate applies never pays the ts-morph project load.
// Child steps run in parallel; the in-process gates run while they finish. Last line is machine
// readable: `RESULT check:file files=N ok|fail step=<failed,steps>`; exit 1 on any failure.
//
// Step (ms) caveat: while the structure gates run, the main thread is blocked (ts-morph is
// synchronous), so a child's close event — and its clock — waits for them; child ms is an UPPER
// bound in gate-bearing runs. `structure`'s own ms is exact, and it is the dominant fixed cost
// (the whole-repo ts-morph load the four global gates require) whenever any packages/tests file
// is touched.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = join(ROOT, "node_modules/.bin");

const TS_RE = /\.(?:ts|tsx|mts|cts)$/u;
// Mirrors the lint:eslint script's path list in package.json — keep the two in sync.
const ESLINT_RE =
  /^(?:packages\/(?:ui|client|server|kit|db|contracts)|tests\/ui|tests\/client)\/.*\.tsx?$/u;
// Mirrors the PostToolUse hook's dep-cruiser guard.
const DEPCRUISE_RE = /^packages\/.*\.(?:ts|tsx|js|jsx|mts|cts)$/u;
// The @orb/ui tsconfig's reach-back includes (browser test trees the root aggregator excludes).
const UI_REACH_BACK_RE = /^(?:tests\/ui\/.*\.(?:ct|fixtures)\.tsx|tests\/support\/ct\/.*\.tsx)$/u;
const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;
const LAYOUT_PKGS_RE = /^packages\/(?:kit|contracts|client|db|ui)\/src\//u;

type PathTest = (rel: string) => boolean;
const inServer: PathTest = (p) => p.startsWith("packages/server/src/");
const inContracts: PathTest = (p) => p.startsWith("packages/contracts/src/");
const inDb: PathTest = (p) => p.startsWith("packages/db/src/");
const inClient: PathTest = (p) => p.startsWith("packages/client/src/");
const inTests: PathTest = (p) => p.startsWith("tests/");
const inAnyScanRoot: PathTest = (p) => PKG_SRC_RE.test(p) || inTests(p);

/** gate name → does a touched path intersect its scan root? Derived from each gate's actual root
 *  constant/regex (see the gate files) — NOT from the gate's topic. The four whole-project
 *  scanners (commented-code &c.) match any file the harness project loads. A gate added to
 *  report.ts but missing here falls back to inAnyScanRoot (over-run, never silently skipped). */
const GATE_SCOPES: Readonly<Record<string, PathTest>> = {
  "commented-code": inAnyScanRoot,
  "no-inline-union-redecl": inAnyScanRoot,
  "no-caller-user-id": inAnyScanRoot,
  "pd-citation-integrity": inAnyScanRoot,
  "feature-structure": inServer,
  "server-layout": inServer,
  "verb-naming": inServer,
  "types-in-contract": inServer,
  "providers-runner-seal": inServer,
  "no-direct-users-read": inServer,
  "sole-env-reader": inServer,
  "assumes-single-replica": inServer,
  "vector-scope-derived": inServer,
  "turn-identity": inServer,
  "membership-enforcer": inServer,
  "owner-role-split": inServer,
  "bus-coverage": (p) => inServer(p) || inContracts(p),
  "member-card-clamped": (p) => inServer(p) || inContracts(p),
  "test-presence": (p) => inServer(p) || inContracts(p) || inTests(p),
  "schema-branding": inDb,
  "db-structure": (p) => inDb(p) || inServer(p),
  "client-structure": inClient,
  "component-size": inClient,
  "ui-primitive-structure": (p) => p.startsWith("packages/ui/src/") || p.startsWith("tests/ui/"),
  "package-layout": (p) => LAYOUT_PKGS_RE.test(p),
  "test-layout": inTests,
  "test-determinism": inTests,
  "test-mock-doctrine": inTests,
  "test-fixture-imports": inTests,
  "test-no-stubs": inTests,
  "test-factory-contract": (p) => p.startsWith("tests/support/factories/"),
};

/** The tsconfig whose program OWNS this file (mirrors how `pnpm -r exec tsc` + the vitest types
 *  project split the repo); undefined = the file is in no TS program (docs, configs, package
 *  files outside src/). */
function tsconfigFor(rel: string): string | undefined {
  if (!TS_RE.test(rel)) {
    return;
  }
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    return `packages/${pkg}/tsconfig.json`;
  }
  if (UI_REACH_BACK_RE.test(rel) || rel.startsWith("playwright/")) {
    return "packages/ui/tsconfig.json";
  }
  const nodeCtx = rel.startsWith("tests/") || rel.startsWith("scripts/") || rel === "reset.d.ts";
  return nodeCtx ? "tsconfig.json" : undefined;
}

type Step = {
  readonly name: string;
  readonly ok: boolean;
  readonly output: string;
  readonly ms: number;
};

function run(name: string, bin: string, args: readonly string[]): Promise<Step> {
  return new Promise((done) => {
    const started = Date.now();
    // NO_COLOR: children write to pipes here; depcruise (chalk) must not emit ANSI codes even
    // when the caller's shell exports FORCE_COLOR.
    // biome-ignore lint/style/noProcessEnv: spawn env passthrough + NO_COLOR — not config reading.
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
    const child = spawn(join(BIN, bin), args, { cwd: ROOT, env });
    let output = "";
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.on("error", (err) => {
      done({ name, ok: false, output: String(err), ms: Date.now() - started });
    });
    child.on("close", (code) => {
      done({ name, ok: code === 0, output, ms: Date.now() - started });
    });
  });
}

function childSteps(paths: readonly string[]): Promise<Step>[] {
  const steps: Promise<Step>[] = [];
  steps.push(
    run("biome", "biome", [
      "check",
      "--reporter=concise",
      "--diagnostic-level=error",
      "--no-errors-on-unmatched",
      ...paths,
    ]),
  );
  const eslintPaths = paths.filter((f) => ESLINT_RE.test(f));
  if (eslintPaths.length > 0) {
    mkdirSync(join(ROOT, ".cache/eslint"), { recursive: true });
    steps.push(
      run("eslint", "eslint", [
        "--cache",
        "--cache-location",
        ".cache/eslint/",
        "--no-color",
        ...eslintPaths,
      ]),
    );
  }
  const depcruisePaths = paths.filter((f) => DEPCRUISE_RE.test(f));
  if (depcruisePaths.length > 0) {
    steps.push(
      run("depcruise", "depcruise", [
        ...depcruisePaths,
        "--config",
        ".dependency-cruiser.cjs",
        "--output-type",
        "err-long",
      ]),
    );
  }
  const configs = [...new Set(paths.map(tsconfigFor).filter((c) => c !== undefined))];
  for (const cfg of configs) {
    steps.push(run(`tsc(${cfg})`, "tsc", ["--noEmit", "--pretty", "false", "-p", cfg]));
  }
  return steps;
}

/** The scoped structure gates, in-process (lazy imports keep gate-free runs off ts-morph). */
async function gatesStep(paths: readonly string[]): Promise<Step | undefined> {
  const { ALL_CHECKS } = await import("./report.ts");
  const gates = ALL_CHECKS.filter((c) =>
    paths.some((f) => (GATE_SCOPES[c.name] ?? inAnyScanRoot)(f)),
  );
  if (gates.length === 0) {
    return;
  }
  const { runChecks } = await import("./harness.ts");
  process.stdout.write(`structure gates (${gates.length} of ${ALL_CHECKS.length} in scope):\n`);
  process.chdir(ROOT); // runChecks roots the ts-morph project at cwd
  const started = Date.now();
  const total = runChecks(gates);
  return { name: "structure", ok: total === 0, output: "", ms: Date.now() - started };
}

function normalize(args: readonly string[]): { paths: string[]; bad: string[] } {
  const paths: string[] = [];
  const bad: string[] = [];
  for (const arg of args) {
    const abs = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
    const rel = relative(ROOT, abs);
    if (rel.startsWith("..") || !existsSync(abs)) {
      bad.push(arg);
    } else if (!paths.includes(rel)) {
      paths.push(rel);
    }
  }
  return { paths, bad };
}

function report(fileCount: number, steps: readonly Step[]): void {
  for (const s of steps) {
    process.stdout.write(`  ${s.ok ? "✓" : "✗"} ${s.name} (${s.ms}ms)\n`);
    if (s.output.trim().length > 0) {
      process.stdout.write(`${s.output.trimEnd()}\n`);
    }
  }
  const failed = steps.filter((s) => !s.ok).map((s) => s.name);
  const tail = failed.length > 0 ? ` fail step=${failed.join(",")}` : " ok";
  process.stdout.write(`RESULT check:file files=${fileCount}${tail}\n`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { paths, bad } = normalize(process.argv.slice(2));
  if (bad.length > 0 || paths.length === 0) {
    const why =
      bad.length > 0
        ? `not under the repo or nonexistent: ${bad.join(", ")}`
        : "usage: pnpm check:file <path...>";
    process.stderr.write(`${why}\n`);
    process.stdout.write(`RESULT check:file files=${paths.length} fail step=args\n`);
    process.exit(1);
  }
  const pending = childSteps(paths);
  const gates = await gatesStep(paths); // runs on this thread while the children run on theirs
  const steps = [...(await Promise.all(pending)), ...(gates === undefined ? [] : [gates])];
  report(paths.length, steps);
}

await main();
