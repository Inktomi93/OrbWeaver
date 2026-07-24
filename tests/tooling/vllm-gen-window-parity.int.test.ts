// Pins the env-owned gen window against the TS launcher's serve flag — the #7 script↔env parity test,
// updated to the TS builder (#14: the launch spec moved from scripts/dev/vllm-engine.sh into
// buildEngineArgv). VLLM_GEN_MAX_MODEL_LEN is the ONE home for the gen engine's context window:
// foundation/env supplies the default the resolved vllm ModelCapability.context.window reads, and
// buildEngineArgv's `gen` arm serves the SAME window via `--max-model-len`. Resolving the launch config from
// the pure env floor (no admin override) MUST make the emitted `--max-model-len` equal the env default — so
// a bump to one home without the other is red at change time (the schema-baseline-parity twin, now for the
// argv builder instead of a shell fallback). Embed + rerank windows are pinned the same way.
import { engineLaunchEnvFloor, env } from "@orb/server/foundation/env";
import { buildEngineArgv, resolveEngineLaunchConfig } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../support/fixtures";

/** Read the value that follows `--max-model-len` in an argv. */
function maxModelLen(argv: readonly string[]): number {
  const i = argv.indexOf("--max-model-len");
  return Number(argv[i + 1]);
}

describe("buildEngineArgv --max-model-len parity with the env floor (no admin override)", () => {
  const config = resolveEngineLaunchConfig(engineLaunchEnvFloor(), undefined);
  const ctx = { repoRoot: "/repo", gpuCount: 2, rerankModelPath: "/snap/rerank" };

  test("gen arm serves --max-model-len === VLLM_GEN_MAX_MODEL_LEN", () => {
    expect(maxModelLen(buildEngineArgv("gen", config, ctx))).toBe(env.VLLM_GEN_MAX_MODEL_LEN);
  });
  test("embed arm serves --max-model-len === VLLM_EMBED_MAX_MODEL_LEN", () => {
    expect(maxModelLen(buildEngineArgv("embed", config, ctx))).toBe(env.VLLM_EMBED_MAX_MODEL_LEN);
  });
  test("rerank arm serves --max-model-len === VLLM_RERANK_MAX_MODEL_LEN", () => {
    expect(maxModelLen(buildEngineArgv("rerank", config, ctx))).toBe(env.VLLM_RERANK_MAX_MODEL_LEN);
  });
});
