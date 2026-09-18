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
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, describe } from "vitest";
import { DEFAULT_EMBED_MODEL } from "../../../../../../packages/server/src/infra/providers/backends/local-light/embed.ts";
import { createModelCache } from "../../../../../../packages/server/src/infra/providers/backends/local-light/model-cache.ts";
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

// WHERE THE WEIGHTS LAND. transformers.js's own default cache is `node_modules/@huggingface/transformers/
// .cache/`: on the container's READ-ONLY rootfs the first download fails, so the GPU-less tier is dead for
// exactly the audience it exists for — and on bare metal that directory is emptied by every `pnpm install`.
// The cache root is therefore `LOCAL_LIGHT_CACHE_DIR`, under the data root, and the two halves the lib will
// not do for us are pinned here against the REAL loader with remote models OFF (nothing is downloaded —
// the load is expected to fail; what it wrote to disk BEFORE trying is the subject): the configured path is
// resolved against the PROCESS cwd (the lib hands `env.cacheDir` straight to `path.join`, so a relative
// value would otherwise follow whatever cwd the process happens to have), and the root EXISTS before the
// first load rather than being created per-file mid-download inside a loader frame.
describe("local-light model cache directory", () => {
  const roots: string[] = [];
  const makeRoot = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "orb-ll-cache-"));
    roots.push(dir);
    return dir;
  };
  const failedLoad = async (cacheDir: string): Promise<void> => {
    const cache = createModelCache({ cacheDir, allowRemoteModels: false });
    await expect(cache.embedTexts(DEFAULT_EMBED_MODEL, ["a character card to index"])).rejects.toThrow();
  };

  afterAll(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates the configured cache root before the first load", async () => {
    const dir = join(makeRoot(), "models", "transformers");
    expect(existsSync(dir)).toBe(false);

    await failedLoad(dir);

    expect(existsSync(dir)).toBe(true);
  });

  test("resolves a RELATIVE configured root against the process cwd, never leaving it relative", async () => {
    const dir = join(makeRoot(), "models");
    const asRelative = relative(process.cwd(), dir);
    expect(isAbsolute(asRelative)).toBe(false);

    await failedLoad(asRelative);

    // Resolved against the cwd — NOT left relative for the lib to join per model file, and not created
    // under the lib's own directory.
    expect(existsSync(dir)).toBe(true);
  });
});
