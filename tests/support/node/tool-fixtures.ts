// The tooling composed test — EXTENDS the house `test`
// (./fixtures.ts), so tooling tests keep clock/ids/db/app/callers and gain the tool seams. Import
// `test`/`expect` from HERE in tests/tooling/** (gate: test-fixture-imports §4.8 — this module is also
// what registers the RESULT snapshot serializer, so entering through plain fixtures bakes unnormalized
// inline snapshots). Fixtures are lazy; heavy work happens inside fixture bodies (the house law).
//
//   scratch      — mkdtemp dir, auto-rm'd after use (kills the hand-rolled cleanup respell).
//   repoRoot     — the ONE root resolution (kills the per-file ROOT respell).
//   runCli       — spawn tooling/src/<tool>/cli.ts via floor/process/proc.spawnNiced (the tooling process's
//                  lowered priority, the owner rule); returns { code, stdout, stderr } for `toExitWith`. Tests name TOOLS, not
//                  paths — a tool move never sweeps test literals again.
//   runSnap      — one snap invocation in-process through the snap host (`openSnapHost`, the door cli.ts runs), in a
//                  fresh context of the file's one Chromium. The Chromium and the snap graph load on the file's first
//                  run, so that case's budget carries them once; importing snap here would bill every tooling file.
//                  A case whose subject is the process (exit wiring, argv misuse, an env knob read at import, a
//                  launch-time browser option) keeps `runCli`. A file's first run and every run in its last case are
//                  also run by the spawned CLI and must print the same, so parity is held per file in this one place.
//   fakeBin      — a Node-backed POSIX + Windows command pair prepended to PATH for the test; auto-restored.
//   plantedTree  — materialize a throwaway violation tree under scratch (the conformance-harness
//                  pattern as a fixture); fsBacked tool tests write only below the owned scratch root.
//   fixturePath  — compose a path below an owned root and REFUSE lexical or symlink escape.
//   plantFile / plantDir / plantLink / removePlanted — the only write door a gate family test has: each
//                  refuses a root that is not an invocation-owned temp dir (never the checkout) and composes
//                  through fixturePath. A gate family test never calls the raw fs write verbs.
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep, win32 } from "node:path";
import process from "node:process";
import { isWithinRoot } from "@orb/kit/path-containment";
import { BOX_LOAD_ENV } from "@orb/tooling/floor/host/load-budget";
import { exportProcessEnv, processEnvValue, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { SnapHost } from "@orb/tooling/snap";
import type { RunnerTestCase, RunnerTestSuite } from "vitest";
import { nonEmpty } from "../iso/non-empty.ts";
import { expect, test as houseTest } from "./fixtures.ts";
import type { AuditRuleProof, FiresAuditRuleProof, RelationalPopulationReport } from "./ui-audit-relational.ts";
import { expectPopulation } from "./ui-audit-relational.ts";

/** The typed CLI outcome `toExitWith` asserts on (tests/support/node/matchers.ts). */
export interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface RunCliOpts {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

/** How one in-process snap run is bounded and checked. `timeoutMs` caps the run below its case's own limit; `env`
 *  plants knobs for this run in this process and in its spawned twin; `parity: true` holds this run to the spawned CLI's
 *  output wherever it sits in the file, and `parity: false` keeps an argv the spawned CLI must never run (a mode that
 *  boots a stage or a daemon) out of it even in the file's first run or last case. */
interface SnapRunOpts {
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly parity?: boolean;
}

export interface ToolFixtures {
  repoRoot: string;
  scratch: string;
  runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  /** One snap invocation in this process, through the snap host the CLI also runs through, in an isolated context of
   *  the test file's one shared Chromium; its `print`/`warn` lines are the result's stdout/stderr. The host returns
   *  within `timeoutMs` or within what remains of the case's own limit, whichever is sooner, with the result
   *  `timedOut` when it ended the run, as a spawned CLI's would be. */
  runSnap: (args: readonly string[], opts?: SnapRunOpts) => Promise<CliResult>;
  fakeBin: (name: string, moduleSource: string) => Promise<void>;
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>;
}

/** The file-scoped half of `runSnap`: one snap host whose Chromium launches on the file's first run. */
interface FileSnapHost {
  readonly run: (args: readonly string[], deadlineMs: number) => Promise<CliResult>;
  /** Whether this file has run snap yet, so the file's first run is the one held to parity. */
  readonly hasRun: () => boolean;
  readonly close: () => Promise<void>;
}

// The snap graph loads on first use, never at import: every tooling test imports this module, and most never drive snap.
function lazySnapHost(): FileSnapHost {
  let host: Promise<SnapHost> | null = null;
  return {
    hasRun: (): boolean => host !== null,
    run: async (args, deadlineMs): Promise<CliResult> => {
      host ??= import("@orb/tooling/snap").then((snap) => snap.openSnapHost("context-per-run"));
      const stdout: string[] = [];
      const stderr: string[] = [];
      const outcome = await (await host).run(args, {
        deadlineMs,
        sink: { line: (text) => stdout.push(`${text}\n`), warn: (text) => stderr.push(`${text}\n`) },
      });
      const ended = outcome.kind === "exited" ? { code: outcome.code, timedOut: false } : { code: null, timedOut: true };
      return { ...ended, stdout: stdout.join(""), stderr: stderr.join("") };
    },
    close: async (): Promise<void> => {
      if (host !== null) {
        await (await host)[Symbol.asyncDispose]();
      }
    },
  };
}

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
// The tasks Vitest will run in this case's file. A filtered run skips the rest, so its last case is the last selected.
const RUNNING_MODES: ReadonlySet<string> = new Set(["run", "only"]);

function runningCases(tasks: readonly (RunnerTestCase | RunnerTestSuite)[]): readonly RunnerTestCase[] {
  return tasks.flatMap((task) => {
    if (task.type === "suite") {
      return runningCases(task.tasks);
    }
    return RUNNING_MODES.has(task.mode) ? [task] : [];
  });
}

function isLastRunningCase(task: Readonly<RunnerTestCase>): boolean {
  return runningCases(task.file.tasks).at(-1)?.id === task.id;
}

async function withPlantedEnv<T>(env: Readonly<Record<string, string>>, run: () => Promise<T>): Promise<T> {
  return await Object.entries(env).reduce<() => Promise<T>>(
    (inner, [key, value]) =>
      async () =>
        await withProcessEnv(key, value, inner),
    run,
  )();
}

async function spawnTool(tool: string, args: readonly string[], opts: RunCliOpts = {}): Promise<CliResult> {
  const { spawnNiced } = await import("@orb/tooling/floor/process/proc");
  const cli = join(REPO_ROOT, "tooling", "src", tool, "cli.ts");
  if (!existsSync(cli)) {
    throw new Error(`runCli: no such tool "${tool}" — expected ${cli} (tools are tooling/src/<tool>/cli.ts)`);
  }
  return await spawnNiced(process.execPath, [cli, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    ...(opts.env === undefined ? {} : { env: opts.env }),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
}
// What a case still does after its snap run returns: read the result and assert on it.
const CASE_TAIL_MS = 1000;
const EXECUTABLE_MODE = 0o755;
const FAKE_BIN_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const WINDOWS_DEVICE_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function windowsBatchLiteral(value: string): string {
  return value.replaceAll("%", "%%");
}

/** Compose a runtime fixture path and refuse lexical or already-present symlink escape. A key computed at
 *  runtime (a proof-row name, a git SHA, a basename read off disk) is bounded here, at construction.
 *
 *  It validates at construction time. `win32.isAbsolute` is deliberate: it also rejects `C:\…` and `\\?\…`
 *  spellings that POSIX `isAbsolute` reads as relative segments. Callers must still not race or replace an
 *  ancestor between this check and their own filesystem call — a lexical+existing-symlink proof, never a
 *  TOCTOU-free sandbox. */
export function fixturePath(root: string, ...segments: readonly string[]): string {
  const lexicalRoot = resolve(root);
  if (segments.some((segment) => win32.isAbsolute(segment))) {
    throw new Error(`fixturePath: ${JSON.stringify(segments)} contains an absolute path`);
  }
  const candidate = resolve(lexicalRoot, ...segments);
  if (!isWithinRoot(lexicalRoot, candidate, { sep })) {
    throw new Error(`fixturePath: ${JSON.stringify(segments)} escapes the owned root`);
  }
  // The owned root does not have to EXIST yet — `plantedTree` composes its tree path before creating it —
  // and an absent root has no ancestor that could already be a link out, so it canonicalises to itself.
  const canonicalRoot = existsSync(lexicalRoot) ? realpathSync(lexicalRoot) : lexicalRoot;
  const relativeCandidate = relative(lexicalRoot, candidate);
  let prefix = lexicalRoot;
  for (const segment of relativeCandidate.split(sep).filter((part) => part !== "")) {
    prefix = join(prefix, segment);
    try {
      lstatSync(prefix);
    } catch (error) {
      // The first ABSENT ancestor ends the walk: nothing below it can already be a link out.
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        break;
      }
      throw error;
    }
    let canonicalPrefix: string;
    try {
      canonicalPrefix = realpathSync(prefix);
    } catch (error) {
      throw new Error(`fixturePath: existing path ${prefix} does not resolve inside the owned root`, { cause: error });
    }
    if (!isWithinRoot(canonicalRoot, canonicalPrefix, { sep })) {
      throw new Error(`fixturePath: existing path ${prefix} resolves outside the owned root`);
    }
  }
  return candidate;
}

const PLANTED_COMPILER_OPTIONS = {
  strict: true,
  target: "ESNext",
  module: "ESNext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
} as const;

export interface PlantedTsconfigOptions {
  readonly lib?: readonly string[];
  readonly paths?: Readonly<Record<string, readonly string[]>>;
  readonly include?: readonly string[];
  /** Set for a planted `.tsx` file, whose elements a declared JSX namespace types. */
  readonly jsx?: "preserve";
}

/** The `tsconfig.json` body of a planted package: strict bundler resolution, no ambient types, DOM unless `lib` says otherwise. */
export function plantedTsconfig({ lib = ["ESNext", "DOM"], paths, include = ["src"], jsx }: PlantedTsconfigOptions = {}): string {
  return JSON.stringify({
    compilerOptions: { ...PLANTED_COMPILER_OPTIONS, lib, ...(paths === undefined ? {} : { paths }), ...(jsx === undefined ? {} : { jsx }) },
    include,
  });
}

/** Canonical roots a fixture handed out (`scratch`); `plantedTree` roots sit below them. A temp directory that
 *  merely lives under `tmpdir()` — a checkout's parent, a sibling checkout — is never a scratch root. */
const MINTED_ROOTS = new Set<string>();

/** The realpath of `path`, or of its nearest existing ancestor joined with the missing tail. */
function canonicalPath(path: string): string {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) {
    existing = dirname(existing);
  }
  return join(realpathSync(existing), relative(existing, path));
}

/** Does any directory strictly above `dir` hold a git entry, i.e. is `dir` inside a checkout? */
function insideCheckout(dir: string): boolean {
  for (let above = dirname(dir); dirname(above) !== above; above = dirname(above)) {
    if (existsSync(join(above, ".git"))) {
      return true;
    }
  }
  return false;
}

/** The target of a scratch write: `rel` composed below `root` through {@link fixturePath}, after `root` is proven
 *  to be (inside) a fixture-minted directory, and the canonical target to stay inside it, outside the checkout. */
function ownedTarget(root: string, rel: string): string {
  const lexicalRoot = resolve(root);
  const canonicalRoot = canonicalPath(lexicalRoot);
  const owner = [...MINTED_ROOTS].find((minted) => isWithinRoot(minted, canonicalRoot, { sep }));
  if (owner === undefined || isWithinRoot(REPO_ROOT, canonicalRoot, { sep }) || insideCheckout(owner)) {
    throw new Error(`scratch write: ${root} is not an invocation-owned temp root`);
  }
  const target = fixturePath(lexicalRoot, rel);
  if (!isWithinRoot(owner, canonicalPath(target), { sep }) || isWithinRoot(REPO_ROOT, canonicalPath(target), { sep })) {
    throw new Error(`scratch write: ${target} resolves outside the owned root`);
  }
  return target;
}

/** Write a file below an owned temp root, creating its parent directories. */
export function plantFile(root: string, rel: string, content: string | Uint8Array): string {
  const target = ownedTarget(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

/** Create a directory (and its parents) below an owned temp root. */
export function plantDir(root: string, rel: string): string {
  const target = ownedTarget(root, rel);
  mkdirSync(target, { recursive: true });
  return target;
}

/** Create a symlink at `rel` below an owned temp root. The link target is read, never written, so it may name the checkout. */
export function plantLink(root: string, rel: string, target: string, type?: "dir" | "file"): string {
  const link = ownedTarget(root, rel);
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link, type);
  return link;
}

/** Remove one planted entry below an owned temp root; a missing entry throws. */
export function removePlanted(root: string, rel: string): void {
  rmSync(ownedTarget(root, rel), { recursive: true });
}

export const test = houseTest.extend<ToolFixtures & { snapHost: FileSnapHost }>({
  snapHost: [
    async ({}, use): Promise<void> => {
      const host = lazySnapHost();
      try {
        await use(host);
      } finally {
        await host.close();
      }
    },
    { scope: "file" },
  ],
  runSnap: async ({ snapHost, task }, use): Promise<void> => {
    const started = performance.now();
    const lastCase = isLastRunningCase(task);
    await use(async (args, opts = {}) => {
      // The host must end a hung run before Vitest ends its case, or the next case queues behind the run.
      const deadlineMs = (): number => Math.min(opts.timeoutMs ?? Number.POSITIVE_INFINITY, task.timeout - (performance.now() - started) - CASE_TAIL_MS);
      const env = (opts.parity ?? (lastCase || !snapHost.hasRun())) ? { ...opts.env, [BOX_LOAD_ENV]: PARITY_BOX_LOAD } : null;
      if (env === null) {
        return await withPlantedEnv(opts.env ?? {}, async () => await snapHost.run(args, deadlineMs()));
      }
      const spawned = await spawnTool("snap", args, { env, timeoutMs: deadlineMs() });
      // The in-process run reads its knobs live from this process's env, so they are planted for exactly this run.
      const inProcess = await withPlantedEnv(env, async () => await snapHost.run(args, deadlineMs()));
      expect(inProcess.code, `spawned stderr:\n${spawned.stderr}`).toBe(spawned.code);
      expect(parityLines(inProcess.stdout)).toEqual(parityLines(spawned.stdout));
      expect(parityLines(inProcess.stderr)).toEqual(parityLines(spawned.stderr));
      return inProcess;
    });
  },
  repoRoot: async ({}, use): Promise<void> => {
    await use(REPO_ROOT);
  },
  scratch: async ({}, use): Promise<void> => {
    const dir = await mkdtemp(join(tmpdir(), "orb-tool-"));
    const minted = realpathSync(dir);
    MINTED_ROOTS.add(minted);
    await use(dir);
    MINTED_ROOTS.delete(minted);
    await rm(dir, { recursive: true, force: true });
  },
  runCli: async ({}, use): Promise<void> => {
    await use(spawnTool);
  },
  fakeBin: async ({ scratch }, use): Promise<void> => {
    const binDir = join(scratch, "fake-bin");
    // PATH manipulation IS this fixture's job: a temp executable must shadow the real one for the spawned child; restored below.
    const originalPath = processEnvValue("PATH");
    const state = { prepended: false };
    await use(async (name, moduleSource) => {
      const invalidName = !FAKE_BIN_NAME_RE.test(name) || name.endsWith(".") || WINDOWS_DEVICE_NAME_RE.test(name);
      if (invalidName) {
        throw new Error(`fakeBin: ${JSON.stringify(name)} must be one command basename`);
      }
      await mkdir(binDir, { recursive: true });
      const moduleName = `${name}.mjs`;
      const posixLauncher = fixturePath(binDir, name);
      const windowsLauncher = fixturePath(binDir, `${name}.cmd`);
      await Promise.all([
        writeFile(fixturePath(binDir, moduleName), moduleSource, "utf8"),
        writeFile(posixLauncher, `#!/usr/bin/env node\nimport ${JSON.stringify(`./${moduleName}`)};\n`, "utf8"),
        writeFile(windowsLauncher, `@echo off\r\n"${windowsBatchLiteral(process.execPath)}" "%~dp0${moduleName}" %*\r\n`, "utf8"),
      ]);
      await chmod(posixLauncher, EXECUTABLE_MODE);
      if (!state.prepended) {
        exportProcessEnv("PATH", `${binDir}${delimiter}${originalPath ?? ""}`);
        state.prepended = true;
      }
    });
    if (state.prepended) {
      exportProcessEnv("PATH", originalPath ?? "");
    }
  },
  plantedTree: async ({ scratch }, use): Promise<void> => {
    let counter = 0;
    await use(async (files) => {
      counter += 1;
      const root = fixturePath(scratch, `tree-${counter}`);
      await Promise.all(
        // Keys are AUTHORED by the caller but arbitrary to this fixture, so containment is checked here
        // rather than assumed: a `"../x"` or absolute key would otherwise plant outside the owned tree.
        Object.entries(files).map(async ([rel, content]) => {
          const abs = fixturePath(root, rel);
          await mkdir(fixturePath(root, dirname(rel)), { recursive: true });
          await writeFile(abs, content, "utf8");
        }),
      );
      return root;
    });
  },
});

// ── the RESULT snapshot serializer (§5.3) — registered by importing THIS module, so only tooling tests
// see it. Normalizes ONLY non-deterministic atoms; everything else serializes untouched. Inline
// snapshots stay the house style.
const ROOT_RE = new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu");
// The mkdtemp DIR segment only, under this OS's temp dir — the tail class excludes the separators so inner
// paths (`/tree-1`) survive.
const SCRATCH_RE = new RegExp(`${RegExp.escape(tmpdir())}[\\\\/][A-Za-z0-9._-]*orb-[A-Za-z0-9._-]*`, "gu");
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/gu;
const PID_RE = /\bpid=\d+/gu;
const RESULT_MS_RE = /\b(\d+)ms\b/gu;
// A RESULT pair named `<key>-ms` carries milliseconds; a RESULT line spells its wall-clock fields both ways.
const RESULT_MS_PAIR_RE = /\b([a-z0-9-]+-ms)=\d+\b/gu;

/** A string carrying a non-deterministic atom (or a RESULT line, whose ms fields are wall clock). */
function needsNormalizing(v: string): boolean {
  ROOT_RE.lastIndex = 0;
  SCRATCH_RE.lastIndex = 0;
  ISO_TS_RE.lastIndex = 0;
  PID_RE.lastIndex = 0;
  RESULT_MS_RE.lastIndex = 0;
  RESULT_MS_PAIR_RE.lastIndex = 0;
  return (
    ROOT_RE.test(v) ||
    SCRATCH_RE.test(v) ||
    ISO_TS_RE.test(v) ||
    PID_RE.test(v) ||
    (v.includes("RESULT ") && (RESULT_MS_RE.test(v) || RESULT_MS_PAIR_RE.test(v)))
  );
}

function normalize(v: string): string {
  let out = v.replaceAll(ROOT_RE, "<root>").replaceAll(SCRATCH_RE, "<scratch>").replaceAll(ISO_TS_RE, "<ts>").replaceAll(PID_RE, "pid=<pid>");
  if (out.includes("RESULT ")) {
    out = out.replaceAll(RESULT_MS_RE, "<ms>ms").replaceAll(RESULT_MS_PAIR_RE, "$1=<ms>");
  }
  return out;
}

// What differs between two runs of one argv on either door: the run slot's `<checkout>-<pid>-<stamp>` id, what
// `normalize` masks on a line (so a RESULT line's wall-clock fields, never a ms figure on another line), and the stack
// frames under a thrown run's TOOL ERROR line, which name the door that called. The box load would differ too, so
// both runs read one planted box instead.
const RUN_SLOT_RE = /-\d+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\b/gu;
const STACK_FRAME_RE = /^ {4}at /u;
const PARITY_BOX_LOAD = "0.2/24";

function parityLines(text: string): readonly string[] {
  return text
    .split("\n")
    .filter((line) => !STACK_FRAME_RE.test(line))
    .map((line) => normalize(line).replaceAll(RUN_SLOT_RE, "-<run>"));
}

/** Register a live design-audit proof. A case with a silent row returns the run's report, and every disposition is
 *  read from it here, so a declared disposition cannot go unchecked. */
export function auditRuleTest<const Proofs extends readonly AuditRuleProof[]>(
  proofs: Proofs,
  title: string,
  fn: (
    fixtures: Pick<ToolFixtures, "runCli" | "runSnap" | "scratch">,
  ) => Proofs[number] extends FiresAuditRuleProof ? Promise<void> | void : Promise<RelationalPopulationReport>,
): void {
  test(title, async ({ runCli, runSnap, scratch }) => {
    expect(nonEmpty(proofs).every((proof) => proof.reason.trim() !== "")).toBe(true);
    const report = await fn({ runCli, runSnap, scratch });
    for (const proof of proofs) {
      if (proof.kind === "silent" && report !== undefined) {
        expectPopulation(report, proof.rule, proof.disposition, {
          alongsideFires:
            proofs.some((other) => other.kind === "fires" && other.rule === proof.rule) && report.findings.some((finding) => finding.rule === proof.rule),
          siblings: proofs.flatMap((other) => (other !== proof && other.kind === "silent" && other.rule === proof.rule ? [other.disposition] : [])),
        });
      }
    }
  });
}

expect.addSnapshotSerializer({
  test: (v: unknown): boolean => typeof v === "string" && needsNormalizing(v),
  serialize: (v: string): string => JSON.stringify(normalize(v)),
});

export { expect } from "./fixtures.ts";
