// The DEV FLEET's env floor — every `VLLM_*` key the owner's engine launcher reads, parsed ONCE from
// `process.env` at module load. These keys LEFT the server schema with the fleet yeet (inference program
// §4, F1): the server knows an engine only as a connection row's `baseUrl` + `features`, so the launcher
// owns its own env reader. Same defaults, same shapes, same comments as the retired server block — the
// argv the compose generator commits must stay byte-identical (`engines-compose.test.ts`).

import process from "node:process";
import { z } from "zod";
import type { EngineLaunchEnvFloor } from "./build-argv.ts";
import type { EngineDeploymentEnv } from "./spawn-engine.ts";

const VLLM_EMBED_PORT_DEFAULT = 8701;
const VLLM_RERANK_PORT_DEFAULT = 8702;
const VLLM_GEN_PORT_DEFAULT = 8703;
// The gen engine's --max-model-len (buildEngineArgv `gen` arm). 65_536 on a 262_144-native checkpoint: at
// gen util 0.6 the KV pool is ~296k tokens, so 64k/request floors concurrency at ~4.5x (owner, 2026-08-18).
const VLLM_GEN_MAX_MODEL_LEN_DEFAULT = 65_536;
// The embed + rerank pooling engines' --max-model-len.
const VLLM_EMBED_MAX_MODEL_LEN_DEFAULT = 8192;
const VLLM_RERANK_MAX_MODEL_LEN_DEFAULT = 8192;
// Per-engine --gpu-memory-utilization floors. GPU0 = embed + gen-half; GPU1 = gen-half + rerank. Every
// engine overshoots its fraction ~2-4% ON GRAPHS, so a 0.90-sum WITH graphs is fatal — the pooling
// engines run enforce-eager. If first boot OOMs: drop gen before touching the pooling floors.
const VLLM_EMBED_GPU_UTIL_DEFAULT = 0.14;
const VLLM_RERANK_GPU_UTIL_MULTI_DEFAULT = 0.14;
const VLLM_RERANK_GPU_UTIL_SINGLE_DEFAULT = 0.1;
const VLLM_GEN_GPU_UTIL_MULTI_DEFAULT = 0.6;
const VLLM_GEN_GPU_UTIL_SINGLE_DEFAULT = 0.5;
// --mm-processor-kwargs max_pixels caps: pooling engines at the reference 1.84M-px vision regime; the gen
// VL engine at its 4.2M-px cap.
const VLLM_POOLING_MAX_PIXELS_DEFAULT = 1_843_200;
const VLLM_GEN_MAX_PIXELS_DEFAULT = 4_194_304;
// Gen video sampling density — LAUNCH-TIME ONLY (vLLM 0.26's per-request media kwargs never reach the
// video sampler, probed 2026-08-18). max_frames caps one clip's token bill (512 ≈ 2min @ fps 4).
const VLLM_GEN_VIDEO_FPS_DEFAULT = 4;
const VLLM_GEN_VIDEO_MAX_FRAMES_DEFAULT = 512;
// The gen engine's chunked-prefill step budget: 8_192 holds two max-size images resident in the encoder
// cache (2_096 left it one-image-at-a-time and multi-image prompts crawled).
const VLLM_GEN_MAX_BATCHED_TOKENS_DEFAULT = 8192;

function envBool(fallback: boolean): z.ZodDefault<z.ZodCodec<z.ZodString, z.ZodBoolean>> {
  return z.stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" }).default(fallback);
}

const fleetEnvSchema = z.object({
  // The DEV fleet's off switch (`pnpm engines` + stack.sh read it; the SERVER schema dropped it with the
  // engine posture — a server never spawns or adopts a fleet any more).
  VLLM_DISABLED: envBool(false),
  // The host the three engines are REACHED at. Default loopback: the bare-metal fleet shares the network
  // namespace; the generated engine-container overlay sets it to the gen service name.
  VLLM_ENGINE_HOST: z.string().min(1).default("127.0.0.1"),
  VLLM_EMBED_PORT: z.coerce.number().int().positive().default(VLLM_EMBED_PORT_DEFAULT),
  VLLM_RERANK_PORT: z.coerce.number().int().positive().default(VLLM_RERANK_PORT_DEFAULT),
  VLLM_GEN_PORT: z.coerce.number().int().positive().default(VLLM_GEN_PORT_DEFAULT),
  VLLM_EMBED_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Embedding-2B"),
  VLLM_RERANK_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Reranker-2B"),
  VLLM_GEN_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-8B-Instruct"),
  VLLM_GEN_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_GEN_MAX_MODEL_LEN_DEFAULT),
  VLLM_EMBED_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_EMBED_MAX_MODEL_LEN_DEFAULT),
  VLLM_RERANK_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_RERANK_MAX_MODEL_LEN_DEFAULT),
  VLLM_EMBED_GPU_UTIL: z.coerce.number().positive().default(VLLM_EMBED_GPU_UTIL_DEFAULT),
  VLLM_RERANK_GPU_UTIL_MULTI: z.coerce.number().positive().default(VLLM_RERANK_GPU_UTIL_MULTI_DEFAULT),
  VLLM_RERANK_GPU_UTIL_SINGLE: z.coerce.number().positive().default(VLLM_RERANK_GPU_UTIL_SINGLE_DEFAULT),
  VLLM_GEN_GPU_UTIL_MULTI: z.coerce.number().positive().default(VLLM_GEN_GPU_UTIL_MULTI_DEFAULT),
  VLLM_GEN_GPU_UTIL_SINGLE: z.coerce.number().positive().default(VLLM_GEN_GPU_UTIL_SINGLE_DEFAULT),
  VLLM_POOLING_MAX_PIXELS: z.coerce.number().int().positive().default(VLLM_POOLING_MAX_PIXELS_DEFAULT),
  VLLM_GEN_MAX_PIXELS: z.coerce.number().int().positive().default(VLLM_GEN_MAX_PIXELS_DEFAULT),
  VLLM_GEN_VIDEO_FPS: z.coerce.number().positive().default(VLLM_GEN_VIDEO_FPS_DEFAULT),
  VLLM_GEN_VIDEO_MAX_FRAMES: z.coerce.number().int().positive().default(VLLM_GEN_VIDEO_MAX_FRAMES_DEFAULT),
  VLLM_GEN_MAX_BATCHED_TOKENS: z.coerce.number().int().positive().default(VLLM_GEN_MAX_BATCHED_TOKENS_DEFAULT),
  // DEPLOYMENT facts (binary + cache stores) the spawner resolves — unset ⇒ the in-repo/venv defaults.
  VLLM_BIN: z.string().min(1).optional(),
  VLLM_PY: z.string().min(1).optional(),
  VLLM_STORE_ROOT: z.string().min(1).optional(),
  HF_HOME: z.string().min(1).optional(),
  VLLM_CACHE_ROOT: z.string().min(1).optional(),
  // `--enable-sleep-mode` on every engine + VLLM_SERVER_DEV_MODE=1 on the child (the /sleep · /wake_up ·
  // /is_sleeping endpoints). Default on so an idle GPU can be reclaimed.
  VLLM_SLEEP_MODE: envBool(true),
  // The ENGINE-SIDE flight recorder (`--enable-log-requests --enable-log-outputs`). Verbose; diagnostics only.
  VLLM_DEBUG_REQUESTS: envBool(false),
  // `--shutdown-timeout N` — a graceful drain window on engine shutdown; 0 = immediate abort.
  VLLM_SHUTDOWN_TIMEOUT_S: z.coerce.number().int().nonnegative().default(0),
});

/** The parsed, frozen fleet env. */
export const fleetEnv: Readonly<z.infer<typeof fleetEnvSchema>> = Object.freeze(fleetEnvSchema.parse(process.env));

/** The raw `process.env` snapshot the spawner spreads under the child. */
export function processEnvSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}

/** The engine LAUNCH-config floor `resolveEngineLaunchConfig` reads — ONE projection of the launch keys, so
 *  the launcher and the compose generator resolve the SAME argv. */
export function engineLaunchEnvFloor(): EngineLaunchEnvFloor {
  return {
    VLLM_EMBED_MODEL: fleetEnv.VLLM_EMBED_MODEL,
    VLLM_RERANK_MODEL: fleetEnv.VLLM_RERANK_MODEL,
    VLLM_GEN_MODEL: fleetEnv.VLLM_GEN_MODEL,
    VLLM_EMBED_MAX_MODEL_LEN: fleetEnv.VLLM_EMBED_MAX_MODEL_LEN,
    VLLM_RERANK_MAX_MODEL_LEN: fleetEnv.VLLM_RERANK_MAX_MODEL_LEN,
    VLLM_GEN_MAX_MODEL_LEN: fleetEnv.VLLM_GEN_MAX_MODEL_LEN,
    VLLM_EMBED_GPU_UTIL: fleetEnv.VLLM_EMBED_GPU_UTIL,
    VLLM_RERANK_GPU_UTIL_MULTI: fleetEnv.VLLM_RERANK_GPU_UTIL_MULTI,
    VLLM_RERANK_GPU_UTIL_SINGLE: fleetEnv.VLLM_RERANK_GPU_UTIL_SINGLE,
    VLLM_GEN_GPU_UTIL_MULTI: fleetEnv.VLLM_GEN_GPU_UTIL_MULTI,
    VLLM_GEN_GPU_UTIL_SINGLE: fleetEnv.VLLM_GEN_GPU_UTIL_SINGLE,
    VLLM_POOLING_MAX_PIXELS: fleetEnv.VLLM_POOLING_MAX_PIXELS,
    VLLM_GEN_MAX_PIXELS: fleetEnv.VLLM_GEN_MAX_PIXELS,
    VLLM_GEN_VIDEO_FPS: fleetEnv.VLLM_GEN_VIDEO_FPS,
    VLLM_GEN_VIDEO_MAX_FRAMES: fleetEnv.VLLM_GEN_VIDEO_MAX_FRAMES,
    VLLM_GEN_MAX_BATCHED_TOKENS: fleetEnv.VLLM_GEN_MAX_BATCHED_TOKENS,
    VLLM_SLEEP_MODE: fleetEnv.VLLM_SLEEP_MODE,
    VLLM_DEBUG_REQUESTS: fleetEnv.VLLM_DEBUG_REQUESTS,
    VLLM_SHUTDOWN_TIMEOUT_S: fleetEnv.VLLM_SHUTDOWN_TIMEOUT_S,
    VLLM_EMBED_PORT: fleetEnv.VLLM_EMBED_PORT,
    VLLM_RERANK_PORT: fleetEnv.VLLM_RERANK_PORT,
    VLLM_GEN_PORT: fleetEnv.VLLM_GEN_PORT,
  };
}

/** The DEPLOYMENT-fact slice the spawner reads (binary + cache stores). */
export function engineDeploymentEnv(): EngineDeploymentEnv {
  return {
    vllmBin: fleetEnv.VLLM_BIN,
    vllmPy: fleetEnv.VLLM_PY,
    storeRoot: fleetEnv.VLLM_STORE_ROOT,
    hfHome: fleetEnv.HF_HOME,
    vllmCacheRoot: fleetEnv.VLLM_CACHE_ROOT,
  };
}
