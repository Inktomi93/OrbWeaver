// `pnpm engines compose` — the front door and the shapes it produces.
//
// RUNNING `engines.sh compose` HERE IS SAFE, and it is the only engines verb of which that is true. The
// standing ban (lane-standing-facts.md) is on invocations that SPAWN vLLM: `ensure`/`start`. This verb's
// case arm is selected before any spawn path is reached and `exec`s a program that reads config and
// writes a file — no port, no GPU, no process. Exercising the real shell is the point: the dispatch, the
// `ORB_ENV_NO_FILE=1` that keeps a local `.env` out of a tracked artifact, and the schema-satisfying
// `AUTH_FALLBACK` are all in the SHELL, so a test that called the node program directly would prove none
// of them.
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processEnvSnapshot } from "@orb/server/foundation/env";
import { ENGINES_COMPOSE_REL } from "@orb/tooling/stack";
import { describe } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ENGINES_SH = "tooling/src/stack/engines.sh";
const MISUSE = 3;

function runCompose(repoRoot: string, args: readonly string[], extraEnv: Readonly<Record<string, string>> = {}): SpawnSyncReturns<string> {
  return spawnSync("bash", [join(repoRoot, ENGINES_SH), "compose", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...processEnvSnapshot(), ...extraEnv },
  });
}

describe("the front door", () => {
  test("`engines.sh compose --stdout` reproduces the committed overlay byte for byte", ({ repoRoot }) => {
    const run = runCompose(repoRoot, ["--stdout"]);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(readFileSync(join(repoRoot, ENGINES_COMPOSE_REL), "utf8"));
  });

  test("a launch-floor key in the environment REFUSES — a tracked artifact never carries one box's config", ({ repoRoot }) => {
    // fromEntries, not a literal: the SCREAMING_SNAKE env key is the thing under test and an object
    // literal would have to be renamed to satisfy the identifier lint.
    const run = runCompose(repoRoot, ["--stdout"], Object.fromEntries([["VLLM_GEN_MODEL", "/media/local/checkpoint"]]));
    expect(run.status).toBe(MISUSE);
    expect(run.stderr).toContain("VLLM_GEN_MODEL");
    expect(run.stdout).not.toContain("/media/local/checkpoint");
  });

  test("a bad GPU count is misuse, not a silent fall-back to the committed topology", ({ repoRoot }) => {
    expect(runCompose(repoRoot, ["--gpus", "0", "--stdout"]).status).toBe(MISUSE);
    expect(runCompose(repoRoot, ["--gpus", "two", "--stdout"]).status).toBe(MISUSE);
    expect(runCompose(repoRoot, ["--stodut"]).status).toBe(MISUSE);
  });

  test("--gpus 1 produces the single-card topology (TP=1) without touching the committed file", ({ repoRoot }) => {
    const before = readFileSync(join(repoRoot, ENGINES_COMPOSE_REL), "utf8");
    const run = runCompose(repoRoot, ["--gpus", "1", "--stdout"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('- "--tensor-parallel-size"\n      - "1"');
    expect(readFileSync(join(repoRoot, ENGINES_COMPOSE_REL), "utf8")).toBe(before);
  });
});

describe("the compose shapes resolve", () => {
  // The `gen`-alone arm and the full trio are the two documented recipes. The third assertion is the
  // CONSEQUENCE of the shared network namespace, stated by compose itself: embed without gen is refused.
  test("base + engines overlay, `gen` alone and all three profiles; embed alone is refused", ({ repoRoot, skip }) => {
    const probe = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
    if (probe.status !== 0) {
      // A LOUD skip, never a silent pass: without compose on the host these shapes were not validated here.
      skip("docker compose is not available on this host — the engines overlay shape was not validated here");
    }
    const config = (...profiles: readonly string[]): SpawnSyncReturns<string> =>
      spawnSync(
        "docker",
        ["compose", "-f", "docker-compose.yaml", "-f", ENGINES_COMPOSE_REL, ...profiles.flatMap((p) => ["--profile", p]), "config", "--quiet"],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );

    const gen = config("gen");
    expect(gen.status, gen.stderr).toBe(0);
    const trio = config("gen", "embed", "rerank");
    expect(trio.status, trio.stderr).toBe(0);
    const embedOnly = config("embed");
    expect(embedOnly.status).not.toBe(0);
    expect(embedOnly.stderr).toContain('depends on undefined service "vllm-gen"');
  });
});
