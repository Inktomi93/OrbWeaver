// Unit tests for buildEngineArgv + resolveEngineLaunchConfig — the pure vLLM launch-spec builder (#14).
// Argv SNAPSHOTS per engine × (env-floor / env-overridden / settings-overridden), plus the layering
// precedence: admin override ?? env floor. GPU-count drives TP + the util split + rerank pinning. No IO —
// config is injected, so this is fully deterministic.
//
// biome-ignore-all lint/style/useNamingConvention: the FLOOR fixture mirrors the EngineLaunchEnvFloor shape
// (VLLM_* env-var names verbatim), so the SCREAMING keys are required, not a style choice.

import { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

// A representative env floor (the schema defaults) — the parity test proves it tracks the real env.
const FLOOR = {
  VLLM_EMBED_MODEL: "Qwen/Qwen3-VL-Embedding-2B",
  VLLM_RERANK_MODEL: "Qwen/Qwen3-VL-Reranker-2B",
  VLLM_GEN_MODEL: "Qwen/Qwen3-VL-8B-Instruct",
  VLLM_EMBED_MAX_MODEL_LEN: 8192,
  VLLM_RERANK_MAX_MODEL_LEN: 8192,
  VLLM_GEN_MAX_MODEL_LEN: 32_768,
  VLLM_EMBED_GPU_UTIL: 0.14,
  VLLM_RERANK_GPU_UTIL_MULTI: 0.16,
  VLLM_RERANK_GPU_UTIL_SINGLE: 0.22,
  VLLM_GEN_GPU_UTIL_MULTI: 0.28,
  VLLM_GEN_GPU_UTIL_SINGLE: 0.5,
  VLLM_POOLING_MAX_PIXELS: 1_843_200,
  VLLM_GEN_MAX_PIXELS: 4_194_304,
  VLLM_GEN_REPETITION_PENALTY: 1.05,
  VLLM_SLEEP_MODE: true,
  VLLM_DEBUG_REQUESTS: false,
  VLLM_SHUTDOWN_TIMEOUT_S: 0,
  VLLM_EMBED_PORT: 8701,
  VLLM_RERANK_PORT: 8702,
  VLLM_GEN_PORT: 8703,
} as const;

const CTX = { repoRoot: "/repo", gpuCount: 2, rerankModelPath: "/snap/rerank" };

/** Read the value following a flag in an argv. */
function flagVal(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i < 0 ? undefined : argv[i + 1];
}

describe("resolveEngineLaunchConfig — admin override ?? env floor", () => {
  test("no override → the env floor verbatim", () => {
    const c = resolveEngineLaunchConfig(FLOOR, undefined);
    expect(c.genMaxModelLen).toBe(32_768);
    expect(c.embedGpuUtil).toBe(0.14);
    expect(c.genMaxPixels).toBe(4_194_304);
    expect(c.genRepetitionPenalty).toBe(1.05);
    expect(c.ports).toEqual({ embed: 8701, rerank: 8702, gen: 8703 });
  });

  test("an admin override wins per field; unset fields fall to the floor", () => {
    const c = resolveEngineLaunchConfig(FLOOR, { genMaxModelLen: 65_536, embedGpuUtil: 0.2 });
    expect(c.genMaxModelLen).toBe(65_536); // overridden
    expect(c.embedGpuUtil).toBe(0.2); // overridden
    expect(c.rerankMaxModelLen).toBe(8192); // floor
    expect(c.genModel).toBe("Qwen/Qwen3-VL-8B-Instruct"); // floor
  });

  test("a null/undefined override field falls to the floor (CLEAR sentinel)", () => {
    const c = resolveEngineLaunchConfig(FLOOR, { genMaxModelLen: null, genModel: undefined });
    expect(c.genMaxModelLen).toBe(32_768);
    expect(c.genModel).toBe("Qwen/Qwen3-VL-8B-Instruct");
  });

  test("ports are env-only — an override can't touch them (deployment facts)", () => {
    const c = resolveEngineLaunchConfig(FLOOR, { genMaxModelLen: 65_536 });
    expect(c.ports.gen).toBe(8703);
  });
});

describe("buildEngineArgv snapshots", () => {
  const config = resolveEngineLaunchConfig(FLOOR, undefined);

  test("embed (env floor)", () => {
    expect(buildEngineArgv("embed", config, CTX)).toMatchInlineSnapshot(`
      [
        "serve",
        "Qwen/Qwen3-VL-Embedding-2B",
        "--runner",
        "pooling",
        "--enforce-eager",
        "--hf_overrides",
        "{"is_matryoshka": true}",
        "--chat-template",
        "/repo/scripts/dev/qwen3_vl_embedding_serve.jinja",
        "--mm-processor-kwargs",
        "{"max_pixels": 1843200}",
        "--host",
        "127.0.0.1",
        "--port",
        "8701",
        "--gpu-memory-utilization",
        "0.14",
        "--max-model-len",
        "8192",
        "--trust-remote-code",
        "--disable-access-log-for-endpoints",
        "/health,/metrics,/ping",
        "--enable-request-id-headers",
        "--enable-force-include-usage",
        "--enable-sleep-mode",
      ]
    `);
  });

  test("rerank (env floor, 2 GPUs → GPU1 util)", () => {
    expect(buildEngineArgv("rerank", config, CTX)).toMatchInlineSnapshot(`
      [
        "serve",
        "/snap/rerank",
        "--served-model-name",
        "Qwen/Qwen3-VL-Reranker-2B",
        "--runner",
        "pooling",
        "--enforce-eager",
        "--host",
        "127.0.0.1",
        "--port",
        "8702",
        "--gpu-memory-utilization",
        "0.16",
        "--max-model-len",
        "8192",
        "--trust-remote-code",
        "--hf_overrides",
        "{"architectures": ["Qwen3VLForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}",
        "--chat-template",
        "/repo/scripts/dev/qwen3_vl_reranker_serve.jinja",
        "--mm-processor-kwargs",
        "{"max_pixels": 1843200}",
        "--disable-access-log-for-endpoints",
        "/health,/metrics,/ping",
        "--enable-request-id-headers",
        "--enable-force-include-usage",
        "--enable-sleep-mode",
      ]
    `);
  });

  test("gen (env floor, 2 GPUs → TP=2 + multi util + alias)", () => {
    expect(buildEngineArgv("gen", config, CTX)).toMatchInlineSnapshot(`
      [
        "serve",
        "Qwen/Qwen3-VL-8B-Instruct",
        "--served-model-name",
        "Qwen3-VL-8B-Instruct",
        "Qwen/Qwen3-VL-8B-Instruct",
        "--tensor-parallel-size",
        "2",
        "--host",
        "127.0.0.1",
        "--port",
        "8703",
        "--gpu-memory-utilization",
        "0.28",
        "--max-num-batched-tokens",
        "2096",
        "--max-num-seqs",
        "150",
        "--max-model-len",
        "32768",
        "--reasoning-parser",
        "qwen3",
        "--chat-template",
        "/repo/scripts/dev/qwen3_gen_thinking_serve.jinja",
        "--default-chat-template-kwargs",
        "{"enable_thinking": false, "preserve_thinking": true}",
        "--structured-outputs-config",
        "{"enable_in_reasoning":true}",
        "--enable-auto-tool-choice",
        "--tool-call-parser",
        "qwen3_coder",
        "--enable-prefix-caching",
        "--mm-encoder-tp-mode",
        "data",
        "--mm-processor-cache-type",
        "shm",
        "--mm-processor-kwargs",
        "{"max_pixels": 4194304}",
        "--override-generation-config",
        "{"temperature":1,"top_p":0.95,"top_k":20,"repetition_penalty":1.05}",
        "--disable-access-log-for-endpoints",
        "/health,/metrics,/ping",
        "--enable-request-id-headers",
        "--enable-force-include-usage",
        "--enable-sleep-mode",
      ]
    `);
  });
});

describe("buildEngineArgv — gen --override-generation-config repetition_penalty (#23)", () => {
  test("env-default gen argv carries the thinking-mode card base (1.0/0.95/20) + repetition_penalty 1.05 as override-generation-config JSON", () => {
    const config = resolveEngineLaunchConfig(FLOOR, undefined);
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--override-generation-config")).toBe(
      '{"temperature":1,"top_p":0.95,"top_k":20,"repetition_penalty":1.05}',
    );
  });

  test("an admin genRepetitionPenalty override changes the emitted JSON (retune → restart)", () => {
    const config = resolveEngineLaunchConfig(FLOOR, { genRepetitionPenalty: 1.1 });
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--override-generation-config")).toBe(
      '{"temperature":1,"top_p":0.95,"top_k":20,"repetition_penalty":1.1}',
    );
  });

  test("an env-floor bump to the penalty shows up in the flag (env-layered default)", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_GEN_REPETITION_PENALTY: 1.15 }, undefined);
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--override-generation-config")).toBe(
      '{"temperature":1,"top_p":0.95,"top_k":20,"repetition_penalty":1.15}',
    );
  });

  test("admin ⊕ env ⊕ default precedence: an admin override wins over the env floor for the penalty", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_GEN_REPETITION_PENALTY: 1.15 }, { genRepetitionPenalty: 1.2 });
    expect(config.genRepetitionPenalty).toBe(1.2);
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--override-generation-config")).toBe(
      '{"temperature":1,"top_p":0.95,"top_k":20,"repetition_penalty":1.2}',
    );
  });

  test("embed + rerank carry NO override-generation-config flag (only gen has a default today)", () => {
    const config = resolveEngineLaunchConfig(FLOOR, undefined);
    expect(buildEngineArgv("embed", config, CTX)).not.toContain("--override-generation-config");
    expect(buildEngineArgv("rerank", config, CTX)).not.toContain("--override-generation-config");
  });
});

describe("buildEngineArgv — env-overridden config changes the flags", () => {
  test("an env-floor bump to the gen window shows up in --max-model-len", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_GEN_MAX_MODEL_LEN: 65_536 }, undefined);
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--max-model-len")).toBe("65536");
  });

  test("an env-floor max_pixels bump shows up in --mm-processor-kwargs", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_POOLING_MAX_PIXELS: 1_000_000 }, undefined);
    expect(flagVal(buildEngineArgv("embed", config, CTX), "--mm-processor-kwargs")).toBe('{"max_pixels": 1000000}');
  });
});

describe("buildEngineArgv — settings-overridden config changes the flags", () => {
  test("an admin genModel override changes the served model + alias", () => {
    const config = resolveEngineLaunchConfig(FLOOR, { genModel: "org/My-Model-14B" });
    const argv = buildEngineArgv("gen", config, CTX);
    expect(argv).toContain("org/My-Model-14B");
    expect(argv).toContain("My-Model-14B"); // slash-free alias
  });

  test("an admin gpu-util override changes --gpu-memory-utilization", () => {
    const config = resolveEngineLaunchConfig(FLOOR, { genGpuUtilMulti: 0.35 });
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--gpu-memory-utilization")).toBe("0.35");
  });
});

describe("buildEngineArgv — sleep mode (--enable-sleep-mode)", () => {
  test("sleepMode on (env floor default) → every engine argv ends with --enable-sleep-mode", () => {
    const config = resolveEngineLaunchConfig(FLOOR, undefined);
    expect(config.sleepMode).toBe(true);
    for (const engine of ["embed", "rerank", "gen"] as const) {
      expect(buildEngineArgv(engine, config, CTX)).toContain("--enable-sleep-mode");
    }
  });

  test("sleepMode off (env floor false) → no engine emits the flag", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_SLEEP_MODE: false }, undefined);
    expect(config.sleepMode).toBe(false);
    for (const engine of ["embed", "rerank", "gen"] as const) {
      expect(buildEngineArgv(engine, config, CTX)).not.toContain("--enable-sleep-mode");
    }
  });

  test("an override false wins over the env-floor true (false is a real override, not CLEAR)", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_SLEEP_MODE: true }, { sleepMode: false });
    expect(config.sleepMode).toBe(false);
    expect(buildEngineArgv("gen", config, CTX)).not.toContain("--enable-sleep-mode");
  });

  test("a null override falls to the env floor (CLEAR sentinel)", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_SLEEP_MODE: true }, { sleepMode: null });
    expect(config.sleepMode).toBe(true);
  });
});

describe("buildEngineArgv — always-on hygiene flags (every engine)", () => {
  const config = resolveEngineLaunchConfig(FLOOR, undefined);
  for (const engine of ["embed", "rerank", "gen"] as const) {
    test(`${engine} silences probe/poller access logs + request-id + force-include-usage`, () => {
      const argv = buildEngineArgv(engine, config, CTX);
      expect(flagVal(argv, "--disable-access-log-for-endpoints")).toBe("/health,/metrics,/ping");
      expect(argv).toContain("--enable-request-id-headers");
      expect(argv).toContain("--enable-force-include-usage");
    });
  }
});

describe("buildEngineArgv — VLLM_DEBUG_REQUESTS (engine-side flight recorder)", () => {
  test("off (default) → no request/output logging flags", () => {
    const argv = buildEngineArgv("gen", resolveEngineLaunchConfig(FLOOR, undefined), CTX);
    expect(argv).not.toContain("--enable-log-requests");
    expect(argv).not.toContain("--enable-log-outputs");
  });
  test("on → --enable-log-requests --enable-log-outputs --max-log-len 2048 on every engine", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_DEBUG_REQUESTS: true }, undefined);
    for (const engine of ["embed", "rerank", "gen"] as const) {
      const argv = buildEngineArgv(engine, config, CTX);
      expect(argv).toContain("--enable-log-requests");
      expect(argv).toContain("--enable-log-outputs");
      expect(flagVal(argv, "--max-log-len")).toBe("2048");
    }
  });
});

describe("buildEngineArgv — VLLM_SHUTDOWN_TIMEOUT_S (graceful drain)", () => {
  test("0 (default) → no --shutdown-timeout flag (immediate abort, today's behavior)", () => {
    expect(buildEngineArgv("gen", resolveEngineLaunchConfig(FLOOR, undefined), CTX)).not.toContain("--shutdown-timeout");
  });
  test("a positive value → --shutdown-timeout N", () => {
    const config = resolveEngineLaunchConfig({ ...FLOOR, VLLM_SHUTDOWN_TIMEOUT_S: 30 }, undefined);
    expect(flagVal(buildEngineArgv("gen", config, CTX), "--shutdown-timeout")).toBe("30");
  });
});

describe("buildEngineArgv — GPU-count topology", () => {
  const config = resolveEngineLaunchConfig(FLOOR, undefined);

  test("single GPU → gen TP=1 + single util; rerank single util", () => {
    const ctx = { ...CTX, gpuCount: 1 };
    expect(flagVal(buildEngineArgv("gen", config, ctx), "--tensor-parallel-size")).toBe("1");
    expect(flagVal(buildEngineArgv("gen", config, ctx), "--gpu-memory-utilization")).toBe("0.5");
    expect(flagVal(buildEngineArgv("rerank", config, ctx), "--gpu-memory-utilization")).toBe("0.22");
  });

  test("engineCudaVisibleDevices pins embed→0, rerank→1 multi (one pooling tenant per card), gen→null (TP spans)", () => {
    expect(engineCudaVisibleDevices("embed", 2)).toBe("0");
    expect(engineCudaVisibleDevices("rerank", 2)).toBe("1");
    expect(engineCudaVisibleDevices("rerank", 1)).toBe("0");
    expect(engineCudaVisibleDevices("gen", 2)).toBeNull();
  });
});
