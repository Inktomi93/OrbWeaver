// The lib-boundary belt (model-cache.ts) acceptance bar: PROCESS SURVIVAL, proven by exit code, not by an
// in-process assertion. transformers.js 4.2.0's model loader orphans an un-awaited promise (getSession spawns
// getCoreModelFile without awaiting it, then hangs on getModelDataFiles' async-executor); when a model file
// is missing that orphan is a FATAL unhandled rejection, and our own `await from_pretrained` never sees it
// (getSession is hung) so no ordinary try/catch can contain it. A test that registers process.on(
// 'unhandledRejection') would MASK the escape (a listener suppresses Node's default crash), so this spawns a
// RAW child node process with NO such listener — production's reality — fires the exact star-crash scenario
// (a never-embedded card's first embed against a partial model cache), and asserts the child EXITS 0. Without
// the belt this child exits non-zero with the transformers loader stack; with it, the embed fails cleanly and
// the process lives. The fixture is a 2 KB config.json only (no ONNX weights) → offline, deterministic, no
// network, no multi-GB download.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = resolve(HERE, "fixtures/orphan-survival-child.mts");
const FIXTURE_CACHE = resolve(HERE, "fixtures/partial-model-cache");
const REPO_ROOT = resolve(HERE, "../../../../../..");
const CHILD_TIMEOUT_MS = 60_000;

interface ChildOutcome {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runSurvivalChild(): Promise<ChildOutcome> {
  return new Promise<ChildOutcome>((resolveOutcome) => {
    const child = spawn("npx", ["tsx", CHILD_SCRIPT, FIXTURE_CACHE], { cwd: REPO_ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolveOutcome({ code, stdout, stderr });
    });
  });
}

describe("local-light model-loader lib-boundary belt", () => {
  test(
    "a missing-model embed degrades cleanly and the raw process SURVIVES (exit 0)",
    async () => {
      const { code, stdout, stderr } = await runSurvivalChild();
      // The embed must reach our own catch (the belt turned the lib's detached orphan into a rejection)…
      expect(stdout).toContain("EMBED_FAILED_CLEANLY");
      // …and, decisively, the process must still be alive at the end (no fatal unhandled rejection).
      expect(stdout, `child stderr:\n${stderr}`).toContain("SURVIVED");
      expect(code).toBe(0);
    },
    CHILD_TIMEOUT_MS,
  );
});
