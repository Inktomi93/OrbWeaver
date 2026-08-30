// The tooling composed test (docs/architecture/core/Core-Tooling-Law.md §5.1) — EXTENDS the house `test`
// (./fixtures.ts), so tooling tests keep clock/ids/db/app/callers and gain the tool seams. Import
// `test`/`expect` from HERE in tests/tooling/** (gate: test-fixture-imports §4.8 — this module is also
// what registers the RESULT snapshot serializer, so entering through plain fixtures bakes unnormalized
// inline snapshots). Fixtures are lazy; heavy work happens inside fixture bodies (the house law).
//
//   scratch      — mkdtemp dir, auto-rm'd after use (kills the hand-rolled cleanup respell).
//   repoRoot     — the ONE root resolution (kills the per-file ROOT respell).
//   runCli       — spawn tooling/src/<tool>/cli.ts via _shared/proc.spawnNiced (nice -n 19, the owner
//                  rule); returns { code, stdout, stderr } for `toExitWith`. Tests name TOOLS, not
//                  paths — a tool move never sweeps test literals again.
//   fakeBin      — a temp executable prepended to PATH for the test (the work-item fake-`gh` shim,
//                  generalized); auto-restored.
//   plantedTree  — materialize a throwaway violation tree under scratch (the conformance-harness
//                  pattern as a fixture); fsBacked tool tests never write the REAL tree (`__g_` stays
//                  reserved for the gate harness).
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { expect, test as houseTest } from "./fixtures.ts";

/** The typed CLI outcome `toExitWith` asserts on (tests/support/matchers.ts). */
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
  fakeBin: (name: string, script: string) => Promise<void>;
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>;
}

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const EXECUTABLE_MODE = 0o755;

export const test = houseTest.extend<ToolFixtures>({
  // biome-ignore lint/suspicious/useAwait: vitest's fixture signature is async; the value is a constant.
  repoRoot: async ({}, use): Promise<void> => {
    await use(REPO_ROOT);
  },
  scratch: async ({}, use): Promise<void> => {
    const dir = await mkdtemp(join(tmpdir(), "orb-tool-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  runCli: async ({}, use): Promise<void> => {
    const { spawnNiced } = await import("@orb/tooling/_shared/proc");
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
    // biome-ignore lint/style/noProcessEnv: PATH manipulation IS this fixture's job — a temp executable must shadow the real one for the spawned child; restored below.
    const originalPath = process.env["PATH"];
    let prepended = false;
    await use(async (name, script) => {
      await mkdir(binDir, { recursive: true });
      const file = join(binDir, name);
      await writeFile(file, script, "utf8");
      await chmod(file, EXECUTABLE_MODE);
      if (!prepended) {
        // biome-ignore lint/style/noProcessEnv: see above — the prepend is the mechanism.
        process.env["PATH"] = `${binDir}${delimiter}${originalPath ?? ""}`;
        prepended = true;
      }
    });
    if (prepended) {
      // biome-ignore lint/style/noProcessEnv: see above — the restore half.
      process.env["PATH"] = originalPath ?? "";
    }
  },
  plantedTree: async ({ scratch }, use): Promise<void> => {
    let counter = 0;
    await use(async (files) => {
      counter += 1;
      const root = join(scratch, `tree-${counter}`);
      await Promise.all(
        Object.entries(files).map(async ([rel, content]) => {
          const abs = join(root, rel);
          await mkdir(dirname(abs), { recursive: true });
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
// The mkdtemp DIR segment only — the tail class excludes `/` so inner paths (`/tree-1`) survive.
const SCRATCH_RE = /\/tmp\/[A-Za-z0-9._-]*orb-[A-Za-z0-9._-]*/gu;
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

expect.addSnapshotSerializer({
  test: (v: unknown): boolean => typeof v === "string" && needsNormalizing(v),
  serialize: (v: string): string => JSON.stringify(normalize(v)),
});

export { expect } from "./fixtures.ts";
