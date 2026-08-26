// biome-ignore-all lint/style/useNamingConvention: module mocks must preserve the production export and environment-key names.
import process from "node:process";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const control = vi.hoisted(() => ({ exit: undefined as number | undefined, headroomReads: 0, spawns: 0 }));
vi.mock("@orb/server/foundation/env", () => ({
  engineDeploymentEnv: () => ({}),
  engineLaunchEnvFloor: () => ({
    VLLM_EMBED_GPU_UTIL: 0.1,
    VLLM_RERANK_GPU_UTIL_MULTI: 0.1,
    VLLM_RERANK_GPU_UTIL_SINGLE: 0.1,
    VLLM_GEN_GPU_UTIL_MULTI: 0.1,
    VLLM_GEN_GPU_UTIL_SINGLE: 0.1,
  }),
  env: { VLLM_DISABLED: false },
  processEnvSnapshot: () => ({}),
}));
vi.mock("@orb/server/infra/providers/vllm/engine", () => ({
  buildEngineSpawnSpec: () => ({ command: "vllm", args: [], env: {} }),
  captureEngineLaunchIdentity: () => null,
  countGpus: () => 1,
  decideWakeBudget: () => ({ ok: true, message: "ok" }),
  engineIdentityFilePath: () => "/tmp/engines.pid",
  engineVramNeed: () => 1,
  fleetRunDir: () => "/tmp",
  queryGpuVram: () => {
    control.headroomReads += 1;
    return Promise.reject(new Error("headroom must not run for an occupied-unproven port"));
  },
  reapOrphanedFamily: async () => [],
  resolveEngineLaunchConfig: () => ({
    ports: { embed: 8881, rerank: 8882, gen: 8883 },
    embedModel: "embed",
    rerankModel: "rerank",
    genModel: "org/gen",
  }),
  signalEngineLaunchIdentity: () => ({ verdict: "absent" }),
  VLLM_ENGINES: ["embed"],
  writeEngineLaunchIdentities: () => undefined,
}));
vi.mock("../../../../tooling/src/_shared/artifacts.ts", () => ({ print: () => undefined }));
vi.mock("../../../../tooling/src/_shared/proc.ts", () => ({
  spawnFullPriorityChild: () => {
    control.spawns += 1;
    throw new Error("spawn must not run for an occupied-unproven port");
  },
}));
vi.mock("../../../../tooling/src/_shared/run-tool.ts", () => ({
  runTool: async (main: () => Promise<number>) => {
    control.exit = await main();
  },
}));
vi.mock("../../../../tooling/src/stack/lib/spawn-lock.ts", () => ({
  acquireSpawnLock: () => true,
  pidIsAlive: () => false,
  releaseSpawnLock: () => undefined,
}));

test("the real fleet launch refuses an unproven health response before headroom or spawn", async () => {
  const priorArgv = process.argv;
  process.argv = [...priorArgv, "--detach"];
  vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
  try {
    await import("../../../../tooling/src/stack/ops/engines.ts");
    expect(control.exit).toBe(2);
    expect(control.headroomReads).toBe(0);
    expect(control.spawns).toBe(0);
  } finally {
    process.argv = priorArgv;
    vi.unstubAllGlobals();
  }
});
