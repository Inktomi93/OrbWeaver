// resolveEngineDeploymentFacts — the env-only DEPLOYMENT-fact projection (port + store path per engine) the
// admin panel shows read-only. With an explicit storeRoot override, resolveStoreRoot short-circuits (no git
// shell), so this is a pure deterministic mapping test: each engine gets its own port and the shared store
// root.

import { resolveEngineDeploymentFacts } from "@orb/tooling/stack/lib/engine-fleet";
import type { EngineLaunchConfig } from "@orb/tooling/stack/lib/engine-fleet";
import { buildEngineSpawnSpec, ENGINE_LAUNCH_MARKER_ENV, mintEngineLaunchMarker } from "@orb/tooling/stack/lib/engine-fleet";
import { describe } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";

// A minimal launch config for the gen/embed spawn-spec env tests — those arms make NO huggingface_hub call
// (only rerank does), and an explicit deployment.storeRoot short-circuits resolveStoreRoot's git shell, so
// these are pure deterministic env assertions.
const LAUNCH: EngineLaunchConfig = {
  embedModel: "org/embed",
  rerankModel: "org/rerank",
  genModel: "org/gen",
  embedMaxModelLen: 8192,
  rerankMaxModelLen: 8192,
  genMaxModelLen: 32_768,
  embedGpuUtil: 0.14,
  rerankGpuUtilMulti: 0.16,
  rerankGpuUtilSingle: 0.22,
  genGpuUtilMulti: 0.55,
  genGpuUtilSingle: 0.5,
  poolingMaxPixels: 1_843_200,
  genMaxPixels: 4_194_304,
  genVideoFps: 4,
  genVideoMaxFrames: 512,
  genMaxBatchedTokens: 8192,
  sleepMode: true,
  debugRequests: false,
  shutdownTimeoutS: 0,
  ports: { embed: 8701, rerank: 8702, gen: 8703 },
};

// Typed via the real opts param so `baseEnv: {}` is CHECKED against NodeJS.ProcessEnv (all-optional keys ⇒
// an empty env is valid), never a hand-shaped literal cast that would survive the opts shape changing.
const LAUNCH_MARKER = mintEngineLaunchMarker();
const SPAWN_OPTS: Parameters<typeof buildEngineSpawnSpec>[2] = {
  repoRoot: "/repo",
  gpuCount: 2,
  deployment: { storeRoot: "/shared/store" },
  baseEnv: {},
  launchMarker: LAUNCH_MARKER,
};

describe("buildEngineSpawnSpec — VLLM_SERVER_DEV_MODE child env (sleep mode)", () => {
  test("sleepMode on → the spawn env carries VLLM_SERVER_DEV_MODE=1 beside the caches", () => {
    const spec = buildEngineSpawnSpec("gen", LAUNCH, SPAWN_OPTS);
    expect(spec.env["VLLM_SERVER_DEV_MODE"]).toBe("1");
    expect(spec.args).toContain("--enable-sleep-mode");
  });

  test("sleepMode off → no VLLM_SERVER_DEV_MODE in the child env, no flag in argv", () => {
    const spec = buildEngineSpawnSpec("gen", { ...LAUNCH, sleepMode: false }, SPAWN_OPTS);
    expect(spec.env["VLLM_SERVER_DEV_MODE"]).toBeUndefined();
    expect(spec.args).not.toContain("--enable-sleep-mode");
  });

  test("embed arm (no hub call) still merges the dev-mode env under sleepMode", () => {
    const spec = buildEngineSpawnSpec("embed", LAUNCH, SPAWN_OPTS);
    expect(spec.env["VLLM_SERVER_DEV_MODE"]).toBe("1");
  });
});

describe("resolveEngineDeploymentFacts", () => {
  test("maps each engine to its serve port and the shared (overridden) store root", () => {
    const facts = resolveEngineDeploymentFacts({
      repoRoot: "/repo",
      deployment: { storeRoot: "/shared/store" },
      ports: { embed: 8701, rerank: 8702, gen: 8703 },
    });

    expect(facts.embed).toEqual({ port: 8701, storePath: "/shared/store" });
    expect(facts.rerank).toEqual({ port: 8702, storePath: "/shared/store" });
    expect(facts.gen).toEqual({ port: 8703, storePath: "/shared/store" });
  });
});

// #1756 — THE LAUNCH MARKER IN THE SPAWN ENV. This is the argv/env snapshot that stands in for running the
// launcher: the engine launcher must NEVER be executed to verify a change (it spawns real vLLM against the
// live ports and its pidfile reconciler reaps every engine it does not own), so the spawn SPEC is the proof
// surface. The marker has to be in the spawn env specifically — exported before the exec, where nothing can
// edit it — because `/proc/<pid>/environ` of a SURVIVING member is the only evidence that outlives the
// leader, and it is what authorizes the negative-PGID kill `engines stop` otherwise refuses to send.
describe("buildEngineSpawnSpec — the per-launch marker (#1756)", () => {
  test("every engine's spawn env carries the launch marker under the ONE contract name", () => {
    for (const engine of ["embed", "gen"] as const) {
      const spec = buildEngineSpawnSpec(engine, LAUNCH, SPAWN_OPTS);
      expect(spec.env[ENGINE_LAUNCH_MARKER_ENV], engine).toBe(LAUNCH_MARKER);
    }
  });

  test("the marker rides BESIDE the caches and CUDA pinning — it replaces nothing", () => {
    // `embed` is the arm that pins a device (gen is TP-wide and sets no CUDA_VISIBLE_DEVICES), so it is the
    // one that proves the marker was merged into a NON-empty env rather than overwriting it.
    const spec = buildEngineSpawnSpec("embed", LAUNCH, SPAWN_OPTS);
    expect(spec.env["HF_HOME"]).toBe("/shared/store/.models/hf");
    expect(spec.env["VLLM_CACHE_ROOT"]).toBe("/shared/store/.cache/vllm");
    expect(spec.env["CUDA_VISIBLE_DEVICES"]).toBe("0");
    expect(spec.env["VLLM_SERVER_DEV_MODE"]).toBe("1");
    expect(spec.env[ENGINE_LAUNCH_MARKER_ENV]).toBe(LAUNCH_MARKER);
  });

  test("a DIFFERENT launch mints a different marker — the token is per-launch, never a constant", () => {
    // The entropy IS the evidence: a fixed token would be forgeable by anything that can set an env var,
    // and a forged token in our recorded group is exactly what the unanimity door treats as proof.
    const other = mintEngineLaunchMarker();
    expect(other).not.toBe(LAUNCH_MARKER);
    expect(buildEngineSpawnSpec("gen", LAUNCH, { ...SPAWN_OPTS, launchMarker: other }).env[ENGINE_LAUNCH_MARKER_ENV]).toBe(other);
  });
});
