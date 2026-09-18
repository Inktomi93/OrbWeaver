// Unit tests for buildEngineArgv + resolveEngineLaunchConfig — the pure vLLM launch-spec builder (#14).
// Argv SNAPSHOTS per engine × (env-floor / env-overridden / settings-overridden), plus the layering
// precedence: admin override ?? env floor. GPU-count drives TP + the util split + rerank pinning. No IO —
// config is injected, so this is fully deterministic.
//

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
  VLLM_GEN_VIDEO_FPS: 4,
  VLLM_GEN_VIDEO_MAX_FRAMES: 512,
  VLLM_GEN_MAX_BATCHED_TOKENS: 8192,
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
        "--hf_overrides",
        "{"is_matryoshka": true}",
        "--chat-template",
        "/repo/packages/server/src/infra/providers/vllm/engine/templates/qwen3_vl_embedding_serve.jinja",
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
        "/repo/packages/server/src/infra/providers/vllm/engine/templates/qwen3_vl_reranker_serve.jinja",
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
        "8192",
        "--max-model-len",
        "32768",
        "--reasoning-parser",
        "qwen3",
        "--chat-template",
        "/repo/packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja",
        "--default-chat-template-kwargs",
        "{"enable_thinking": false, "preserve_thinking": true}",
        "--structured-outputs-config",
        "{"enable_in_reasoning":false}",
        "--enable-auto-tool-choice",
        "--tool-call-parser",
        "qwen3_coder",
        "--speculative-config",
        "{"method":"mtp","num_speculative_tokens":3}",
        "--enable-prefix-caching",
        "--mm-encoder-tp-mode",
        "data",
        "--mm-processor-cache-type",
        "shm",
        "--mm-processor-kwargs",
        "{"max_pixels": 4194304, "fps": 4, "max_frames": 512}",
        "--disable-access-log-for-endpoints",
        "/health,/metrics,/ping",
        "--enable-request-id-headers",
        "--enable-force-include-usage",
        "--enable-sleep-mode",
      ]
    `);
  });
});

// ── #23, REVERSED 2026-08-14: the launch home for samplers is GONE. `--override-generation-config` existed
// only for the retired sampler-less agent-sdk /v1/messages wire; while it rode the serve command it silently
// outranked the checkpoint's own generation_config.json on EVERY request. The gen repetition-penalty default
// now rides the request (surfaces/chat.ts, `genRepetitionPenalty` — see that suite). These tests are the
// fence that keeps the second home from growing back. ──
describe("buildEngineArgv — NO launch-baked samplers (--override-generation-config is gone, #23)", () => {
  const config = resolveEngineLaunchConfig(FLOOR, undefined);

  for (const engine of ["embed", "rerank", "gen"] as const) {
    test(`${engine} emits no --override-generation-config (samplers are per-request, never baked at launch)`, () => {
      expect(buildEngineArgv(engine, config, CTX)).not.toContain("--override-generation-config");
    });
  }

  test("gen carries no repetition_penalty anywhere in its argv (the checkpoint's own generation_config wins)", () => {
    expect(buildEngineArgv("gen", config, CTX).join(" ")).not.toContain("repetition_penalty");
  });

  test("the resolved launch config holds no sampler field — the launch tier is flags-only", () => {
    expect(config).not.toHaveProperty("genRepetitionPenalty");
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

  test("gen --mm-processor-kwargs is ONE blob carrying max_pixels + the video sampling density", () => {
    // fps/max_frames are launch-time-only in vLLM 0.26 (per-request kwargs never reach the video
    // sampler), so this flag is the single home of video density; a second --mm-processor-kwargs
    // occurrence would shadow the first.
    const config = resolveEngineLaunchConfig(FLOOR, undefined);
    const argv = buildEngineArgv("gen", config, CTX);
    expect(argv.filter((a) => a === "--mm-processor-kwargs")).toHaveLength(1);
    expect(flagVal(argv, "--mm-processor-kwargs")).toBe('{"max_pixels": 4194304, "fps": 4, "max_frames": 512}');
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

// ── `--host`: loopback BY CONSTRUCTION, and the one caller that moves it (the engine-container compose
// generator, tooling/src/stack/lib/engines-compose.ts). A process that binds 127.0.0.1 inside a container
// is unreachable from its peers, so the container arm passes `bindHost: "0.0.0.0"` and bounds reachability
// with the container network instead. The default is what keeps every OTHER caller — the in-server
// supervisor and the standalone launcher, neither of which passes the field — byte-identical. ──
describe("buildEngineArgv — the --host bind address", () => {
  const config = resolveEngineLaunchConfig(FLOOR, undefined);

  for (const engine of ["embed", "rerank", "gen"] as const) {
    test(`${engine} binds loopback when the caller passes no bindHost`, () => {
      expect(flagVal(buildEngineArgv(engine, config, CTX), "--host")).toBe("127.0.0.1");
    });

    test(`${engine}: an explicit bindHost changes the --host value and NOTHING else`, () => {
      const bare = buildEngineArgv(engine, config, CTX);
      const bound = buildEngineArgv(engine, config, { ...CTX, bindHost: "0.0.0.0" });
      expect(flagVal(bound, "--host")).toBe("0.0.0.0");
      const hostValueIndex = bare.indexOf("--host") + 1;
      expect(bound).toEqual(bare.map((arg, i) => (i === hostValueIndex ? "0.0.0.0" : arg)));
    });
  }
});
