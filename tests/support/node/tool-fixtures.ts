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
//   runSnap      — one snap invocation in-process through `runSnapCommand`, the door cli.ts runs, in a fresh context of
//                  the file's one Chromium (`contextsIn`). The Chromium and the snap graph load on the file's first
//                  run, so that case's budget carries them once; importing snap here would bill every tooling file.
//                  A case whose subject is the process (exit wiring, argv misuse, an env knob read at import, a
//                  launch-time browser option) keeps `runCli`; `expectSnapParity` holds the two doors to one output.
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

export interface ToolFixtures {
  repoRoot: string;
  scratch: string;
  runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  /** One snap invocation in this process, through the CLI's own door (`runSnapCommand`), in an isolated context of
   *  the test file's one shared Chromium; its `print`/`warn` lines are the result's stdout/stderr. */
  runSnap: (args: readonly string[]) => Promise<CliResult>;
  fakeBin: (name: string, moduleSource: string) => Promise<void>;
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>;
}

/** The file-scoped half of `runSnap`: the shared Chromium launches on the first run and closes at the file's end. */
interface SnapHost {
  readonly run: (args: readonly string[]) => Promise<CliResult>;
  readonly close: () => Promise<void>;
}

// Loaded on first use, never at import: every tooling test imports this module, and most never drive snap.
async function openSnapHost(): Promise<SnapHost> {
  const snap = await import("@orb/tooling/snap");
  const { installOutputSink } = await import("@orb/tooling/floor/cli/log");
  const { closeProbeSession } = await import("@orb/tooling/floor/browser/browser");
  const owner = await snap.launchSnapSession(snap.parseSnapArgs(["--no-failure-evidence"]));
  const browser = snap.contextsIn(owner);
  return {
    run: async (args): Promise<CliResult> => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const release = installOutputSink({ line: (text) => stdout.push(`${text}\n`), warn: (text) => stderr.push(`${text}\n`) });
      let code: number;
      try {
        code = await snap.runSnapCommand(args, browser);
      } finally {
        release();
      }
      return { code, stdout: stdout.join(""), stderr: stderr.join(""), timedOut: false };
    },
    close: async (): Promise<void> => {
      await closeProbeSession(owner);
    },
  };
}

function lazySnapHost(): SnapHost {
  let opened: Promise<SnapHost> | null = null;
  return {
    run: async (args): Promise<CliResult> => {
      opened ??= openSnapHost();
      return await (await opened).run(args);
    },
    close: async (): Promise<void> => {
      if (opened !== null) {
        await (await opened).close();
      }
    },
  };
}

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
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

export const test = houseTest.extend<ToolFixtures & { snapHost: SnapHost }>({
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
  runSnap: async ({ snapHost }, use): Promise<void> => {
    await use(snapHost.run);
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
    const { spawnNiced } = await import("@orb/tooling/floor/process/proc");
    await use(async (tool, args, opts = {}) => {
      const cli = join(REPO_ROOT, "tooling", "src", tool, "cli.ts");
      if (!existsSync(cli)) {
        throw new Error(`runCli: no such tool "${tool}" — expected ${cli} (tools are tooling/src/<tool>/cli.ts)`);
      }
      return await spawnNiced(process.execPath, [cli, ...args], {
        cwd: opts.cwd ?? REPO_ROOT,
        ...(opts.env === undefined ? {} : { env: opts.env }),
        ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
      });
    });
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

/** A string carrying a non-deterministic atom (or a RESULT line, whose ms fields are wall clock). */
function needsNormalizing(v: string): boolean {
  ROOT_RE.lastIndex = 0;
  SCRATCH_RE.lastIndex = 0;
  ISO_TS_RE.lastIndex = 0;
  PID_RE.lastIndex = 0;
  return ROOT_RE.test(v) || SCRATCH_RE.test(v) || ISO_TS_RE.test(v) || PID_RE.test(v) || (v.includes("RESULT ") && RESULT_MS_RE.test(v));
}

function normalize(v: string): string {
  let out = v.replaceAll(ROOT_RE, "<root>").replaceAll(SCRATCH_RE, "<scratch>").replaceAll(ISO_TS_RE, "<ts>").replaceAll(PID_RE, "pid=<pid>");
  if (out.includes("RESULT ")) {
    out = out.replaceAll(RESULT_MS_RE, "<ms>ms");
  }
  return out;
}

// What differs between two runs of one argv on either door: the run slot's `<checkout>-<pid>-<stamp>` id and
// wall-clock timings. The box load would too (its readings, the rate posture hashed from them, and the load-suspect
// label crossing the threshold between two runs), so both runs read one planted box instead.
const RUN_SLOT_RE = /-\d+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\b/gu;
const ANY_MS_RE = /\b\d+(?:\.\d+)?ms\b/gu;
const MS_FIELD_RE = /\b([a-z-]+-ms)=\d+/gu;
const PARITY_BOX_LOAD = "0.2/24";

function parityText(text: string): string {
  return normalize(text).replaceAll(RUN_SLOT_RE, "-<run>").replaceAll(ANY_MS_RE, "<ms>ms").replaceAll(MS_FIELD_RE, "$1=<ms>");
}

/** Run one argv through the spawned snap CLI and through `runSnap` on one planted box load, require the same exit
 *  code and the same stdout once run identity and wall-clock timings are masked, and return the in-process result. */
export async function expectSnapParity(fixtures: Pick<ToolFixtures, "runCli" | "runSnap">, args: readonly string[]): Promise<CliResult> {
  const spawned = await fixtures.runCli("snap", args, { env: { [BOX_LOAD_ENV]: PARITY_BOX_LOAD } });
  // The in-process run reads the knob live from this process's env, so it is planted for exactly this call.
  const inProcess = await withProcessEnv(BOX_LOAD_ENV, PARITY_BOX_LOAD, async () => await fixtures.runSnap(args));
  expect(inProcess.code, `spawned stderr:\n${spawned.stderr}`).toBe(spawned.code);
  expect(parityText(inProcess.stdout)).toBe(parityText(spawned.stdout));
  return inProcess;
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
