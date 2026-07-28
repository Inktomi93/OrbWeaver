// resolveEngineDeploymentFacts — the env-only DEPLOYMENT-fact projection (port + store path per engine) the
// admin panel shows read-only. With an explicit storeRoot override, resolveStoreRoot short-circuits (no git
// shell), so this is a pure deterministic mapping test: each engine gets its own port and the shared store
// root.

import { resolveEngineDeploymentFacts } from "@orb/server/infra/providers";
import type { EngineLaunchConfig } from "@orb/server/infra/providers/vllm/engine";
import { buildEngineSpawnSpec } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

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
  genRepetitionPenalty: 1.05,
  sleepMode: true,
  debugRequests: false,
  shutdownTimeoutS: 0,
  ports: { embed: 8701, rerank: 8702, gen: 8703 },
};

// Typed via the real opts param so `baseEnv: {}` is CHECKED against NodeJS.ProcessEnv (all-optional keys ⇒
// an empty env is valid), never a hand-shaped literal cast that would survive the opts shape changing.
const SPAWN_OPTS: Parameters<typeof buildEngineSpawnSpec>[2] = { repoRoot: "/repo", gpuCount: 2, deployment: { storeRoot: "/shared/store" }, baseEnv: {} };

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
