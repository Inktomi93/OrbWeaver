// The one `process.env` reader: the `.env` load, the zod envSchema parse, the AUTH_MODE superRefine
// boot-fatality, the frozen `env`, and the raw processEnvSnapshot() baseline the agent-sdk credential
// firewall spreads into its child.
//
// Every other tier imports `env` and dot-accesses a typed key. This file is the sole place that touches
// process.env; never written, parsed once, frozen, read down as the floor.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { AUTH_MODES } from "@orb/contracts/identity";
import { LOG_LEVELS } from "@orb/contracts/settings";
import { z } from "zod";
import type { DiagnosticsPostureInput } from "./diagnostics.ts";
import type { EnginesPosture } from "./posture.ts";
import { ENGINES_POSTURES } from "./posture.ts";

export type { DiagnosticsExposure, DiagnosticsPosture, DiagnosticsPostureInput } from "./diagnostics.ts";
export { DIAGNOSTICS_EXPOSURES, diagnosticsPostureWarnings, resolveDiagnosticsPosture } from "./diagnostics.ts";
export type { EnginesPosture } from "./posture.ts";
export { ENGINES_POSTURES, effectiveVllmDisabled, postureManages, postureRegistersBackend, resolveEnginesPosture } from "./posture.ts";

const DEFAULT_PORT = 8788;
// vLLM loopback engine ports (must match what the stack supervisor passes).
const VLLM_EMBED_PORT_DEFAULT = 8701;
const VLLM_RERANK_PORT_DEFAULT = 8702;
const VLLM_GEN_PORT_DEFAULT = 8703;
// The unified text+image embedding space's output dimension (matches every F32_BLOB(1024) vector column).
const VLLM_EMBED_DIM_DEFAULT = 1024;
const VLLM_EMBED_CHUNK_DEFAULT = 128;
// The gen engine's --max-model-len (buildEngineArgv `gen` arm). ONE home for the window so the launcher's
// serve flag and the resolved ModelCapability.context.window can't drift (parity-tested + engine-self-report
// outranks it for capability truth). The engine's OWN /v1/models max_model_len wins at runtime.
const VLLM_GEN_MAX_MODEL_LEN_DEFAULT = 32_768;
// The embed + rerank pooling engines' --max-model-len. ONE home for the 8192 that was hand-copied into the
// shell script's embed/rerank arms AND the character embed-text char budget AND the local-light capability
// window. The engines self-report these too (extend-of the gen-window seam); the env is the launch flag +
// the absence-degrade floor when the engine is warming/disabled.
const VLLM_EMBED_MAX_MODEL_LEN_DEFAULT = 8192;
const VLLM_RERANK_MAX_MODEL_LEN_DEFAULT = 8192;
// Per-engine --gpu-memory-utilization floors (measured bare-metal — see buildEngineArgv's header). Multi-GPU
// gen uses the split default; single-GPU packing is derived in the builder from these + the GPU count.
const VLLM_EMBED_GPU_UTIL_DEFAULT = 0.14;
const VLLM_RERANK_GPU_UTIL_MULTI_DEFAULT = 0.16;
const VLLM_RERANK_GPU_UTIL_SINGLE_DEFAULT = 0.22;
// 0.28 was the ComfyUI-coexistence floor: it left the gen engine 45,328 KV tokens = 1.38x concurrency at
// the 32,768 max-model-len (vLLM's own boot math, 2026-07-27) — ONE in-flight chat-sized request, so any
// slow turn starved every other. ComfyUI's GPU residency ended; gen claims the freed VRAM for KV headroom
// (~6x full-context concurrency on 2×A6000). Owner-directed re-provision — drop back toward 0.28 if a
// ComfyUI-class GPU tenant returns.
const VLLM_GEN_GPU_UTIL_MULTI_DEFAULT = 0.6;
const VLLM_GEN_GPU_UTIL_SINGLE_DEFAULT = 0.5;
// --mm-processor-kwargs max_pixels caps: pooling engines (embed/rerank) at the reference 1.84M-px vision
// regime; the gen VL engine at its 4.2M-px cap. ONE home for the two literals the shell hand-carried.
const VLLM_POOLING_MAX_PIXELS_DEFAULT = 1_843_200;
const VLLM_GEN_MAX_PIXELS_DEFAULT = 4_194_304;
// The gen engine's --override-generation-config repetition_penalty (#23). Qwen3-VL ships
// generation_config.json repetition_penalty=1.0 (no repeat penalty → the agent-sdk /v1/messages path
// loops to the output cap → api_error, live turn_127). The Anthropic Messages wire carries NO per-request
// penalty, so the sdk path can't self-correct — it MUST be a LAUNCH default baked into the serve command.
// 1.0 is the Qwen3-VL-8B-Instruct model-card value (huggingface.co/Qwen/Qwen3-VL-8B-Instruct) — the
// loop is fixed by pairing this base with the card's presence_penalty 1.5 (applied per-request), not by
// over-penalizing repetition. ONE home for the literal; env-layered so an admin can retune + restart.
const VLLM_GEN_REPETITION_PENALTY_DEFAULT = 1.0;
// The gen engine's default PRESENCE penalty applied per-REQUEST by the vLLM chat surface when a preset is
// silent (Phase B ⑩ item 7). 1.5 = the former hardcoded CARD_DEFAULT_PRESENCE_PENALTY (Qwen3-VL card), now
// env-layered ⊕ AppSettings override so an admin can retune the per-launched-model default. OpenAI range -2..2.
const VLLM_GEN_PRESENCE_PENALTY_DEFAULT = 1.5;
// The agent-sdk backend's max in-flight summarize calls (Phase B ⑩ item 1, Q6). 4 = the former hardcoded
// SUMMARIZE_CONCURRENCY; env-layered ⊕ AppSettings override. DISTINCT from the vLLM engine's summarize floor.
const AGENT_SDK_SUMMARIZE_CONCURRENCY_DEFAULT = 4;
// Whole-request embed timeout (ms): a warming/wedged engine can't hang boot-time embedding forever.
const VLLM_EMBED_REQUEST_TIMEOUT_MS_DEFAULT = 120_000;
// Manager-posture auto-sleep idle window (ms): a fully-idle engine is /sleep'd after 10 min (B.5).
const VLLM_AUTO_SLEEP_IDLE_MS_DEFAULT = 600_000;
const MIN_SESSION_SECRET_CHARS = 32;
const MIN_PASSWORD_LENGTH = 8;
const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_AI_TURN_DEFAULT = 30;
const RATE_LIMIT_PUBLIC_IP_DEFAULT = 60;
const RATE_LIMIT_AUTHED_DEFAULT = 600;
const RATE_LIMIT_LOGIN_DEFAULT = 10;

// The `.env` file the loader below reads, cwd-relative — exactly the path dotenv resolved
// (`path.resolve(process.cwd(), ".env")`), so `pnpm start` from the repo root keeps finding it.
const ENV_FILE = ".env";
// A leading UTF-8 byte-order mark. parseEnv does NOT strip it (dotenv did) — see loadEnvFileWithOverride.
const UTF8_BOM = "﻿";

/** Load a local `.env` into `process.env`. `override` = a checked-in dev `.env` WINS over an already-set
 *  (stale shell) export; otherwise the file only fills keys that are unset.
 *
 *  dotenv died here 2026-08-03 (node-26 adoption program §3) — `node:util`'s `parseEnv` IS the platform
 *  .env parser. `process.loadEnvFile()` is deliberately NOT used: it can only ever fill UNSET keys, and
 *  the override direction is load-bearing (the dev stack pins model/port/posture in the checked-in
 *  `.env`; a silent flip to "a stale shell export wins" reads as a config bug for hours). The merge is
 *  therefore OURS and stays explicit here.
 *
 *  Parity with dotenv 16.6.1 was MEASURED case-by-case (30 inputs, 2026-08-03), not assumed: identical on
 *  comments, blank + junk lines, `export ` prefixes, single/double/backtick quotes, `\n` escapes inside
 *  double quotes, literal multiline quoted values, inline `#` comments, CRLF, duplicate keys, unterminated
 *  quotes and the empty file. Exactly two deltas:
 *    1. a UTF-8 BOM — dotenv stripped it, `parseEnv` keeps it IN THE KEY, silently renaming the first key
 *       to `﻿KEY`. That is precisely the silent-misconfiguration class this loader must not ship, so
 *       the BOM is stripped below.
 *    2. dotenv also accepted a non-standard `KEY: value` separator; `parseEnv` ignores such a line. No
 *       `.env` in this repo or on this box uses it, and re-implementing a vendor dialect would defeat
 *       adopting the platform parser. Accepted, and pinned by test so the delta stays deliberate.
 *
 *  A missing or unreadable file is a silent no-op — the same tolerance dotenv's `quiet: true` gave. */
function loadEnvFileWithOverride(override: boolean): void {
  // ORB_ENV_NO_FILE — skip the file ENTIRELY (not merely the override direction). Set globally by
  // vitest.config.ts: filling unset keys from a real `.env` makes a test assert against the operator's
  // deploy config rather than the schema default, which produced reds that were not regressions (see that
  // file's note). Distinct from ORB_ENV_NO_OVERRIDE below, which keeps the load and only flips precedence.
  if (process.env["ORB_ENV_NO_FILE"] !== undefined) {
    return;
  }
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(raw.startsWith(UTF8_BOM) ? raw.slice(UTF8_BOM.length) : raw))) {
    if (value !== undefined && (override || process.env[key] === undefined)) {
      process.env[key] = value;
    }
  }
}

// Load a local .env before parsing. override:true so a checked-in dev .env wins over a stale shell
// export. Two escape hatches (VITEST, ORB_ENV_NO_OVERRIDE=1) keep the override from fighting a one-off
// invocation that wants its own shell vars honored.
const skipOverride = process.env["VITEST"] !== undefined || process.env["ORB_ENV_NO_OVERRIDE"] !== undefined;
loadEnvFileWithOverride(!skipOverride);

/** A boolean knob's env codec — ONE home for the posture, so no site can drift.
 *
 *  The params are PINNED and the pinning is the whole point: bare `z.stringbool()` is case-INSENSITIVE and
 *  accepts `1/0/yes/no/on/off` (probed on 4.4.3), which would silently WIDEN every boolean knob's accepted
 *  vocabulary. With `{truthy:["true"], falsy:["false"], case:"sensitive"}` the accepted set is byte-identical
 *  to the `z.enum(["true","false"]).transform(v => v === "true")` this replaces: only lowercase `true`/`false`
 *  parse, and `TRUE`/`1`/`yes`/`on`/`""` stay a LOUD boot refusal. `.default()` takes the BOOLEAN (the codec's
 *  output type), so an unset key never runs the string decode at all. */
function envBool(fallback: boolean): z.ZodDefault<z.ZodCodec<z.ZodString, z.ZodBoolean>> {
  return z.stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" }).default(fallback);
}

/** The env keys each AUTH_MODE cannot boot without (the superRefine's boot-fatality table). A mapped-type
 *  Record over `AUTH_MODES` — a fifth mode fails `tsc` here rather than silently requiring nothing. The
 *  two credential-less modes are `[]` on purpose: `single-user` needs none, and `forward-header`'s
 *  requirements are conditional (the signed path needs a JWKS source, which `infra/auth/config` resolves
 *  and fails CLOSED on) rather than hard-fatal at parse. */
const AUTH_MODE_REQUIRED_ENV = {
  "single-user": [],
  // B4 — LOCAL_INITIAL_PASSWORD is NO LONGER required: a fresh local box seeds the owner row with a NULL
  // password and the in-app first-run setup (`POST /api/auth/first-run`, gated on that null) claims it on
  // first visit. SESSION_SECRET stays required (the scrypt pepper + session-token HMAC). Setting
  // LOCAL_INITIAL_PASSWORD still works — it seeds the password at boot, so the first-run screen never appears.
  local: ["SESSION_SECRET"],
  oidc: ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URIS", "SESSION_SECRET"],
  "forward-header": [],
} as const satisfies Record<(typeof AUTH_MODES)[number], readonly string[]>;

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // OpenRouter (chat-completions + responses runners, non-Claude models). Optional — omit when running
    // on agent-sdk/max-pro-sub only.
    OPENROUTER_API_KEY: z.string().min(1).optional(),

    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    // Gates /api/_debug/*. Unset = off (404). Set (any value) to enable; a request must present it via
    // x-debug-token.
    DEBUG_TOKEN: z.string().min(1).optional(),
    // Opt-in for the rpg flight recorder (R-OBS). Default off ⇒ `RpgContext.trace` is unwired ⇒ zero-cost +
    // byte-identical turns. `on` wires the per-process ring recorder read host-only at /api/_debug/rpg/traces
    // (the drive kit forces it on via the `rpgTrace` compose dep, bypassing this env knob).
    RPG_TRACE: z.enum(["on", "off"]).default("off"),
    // TASK-24 wire-capture: opt-in for the provider-request-body recorder (the four-layer fidelity harness).
    // Default off ⇒ compose wires NO capture sink into the backends ⇒ zero-cost + byte-identical turns +
    // zero retained bytes. `on` wires the sink; the per-process ring is read host-only at
    // /api/_debug/wire/captures (the drive kit / an int test forces it on via the `wireCapture` compose dep).
    WIRE_CAPTURE: z.enum(["on", "off"]).default("off"),
    // The E2E-HARNESS SELF-STAMP. `on` is set ONLY by the Playwright webServer env (tests/e2e/support/modes.ts)
    // when the harness boots a stack it owns; it makes `/healthz` report `harness:true` so the e2e globalSetup
    // can PROVE the origin it is about to seed is a throwaway harness stack and not the operator's dev stack
    // (tests/e2e/support/target-guard.ts). Never set in dev or prod — the stamp's whole value is that a stack a
    // human started does NOT carry it.
    // ONE behavior rides it (2026-08-03, the forced-first-run redesign): together with `DEV_SEED` it enables
    // the default-persona seeder's AUTO-CREATE arm, so a harness stack never lands a spec on the blocking
    // first-run persona ask. It stays a self-stamp otherwise (`/healthz`), and nothing else branches on it.
    E2E_HARNESS: z.enum(["on", "off"]).default("off"),
    // The DEV-STACK SEED stamp — the dev twin of `E2E_HARNESS` for automation-started stacks. `on` is set by
    // `scripts/dev/stack.sh` (host export wins, so `DEV_SEED=off pnpm stack restart` rehearses a REAL first
    // sign-in). It enables the default-persona seeder's auto-create arm: without it every dev DB regen would
    // greet the operator with the forced first-run persona dialog, which is exactly the constraint that kept
    // the forced ask from shipping. Default off ⇒ a real deployment ASKS (D107's zero-personas trigger holds).
    // Deliberately NOT a `NODE_ENV` inference: this repo's env law is explicit natures, and "is this a dev
    // stack" is not the same question as "is this a development build".
    DEV_SEED: z.enum(["on", "off"]).default("off"),

    DATABASE_URL: z.string().min(1).default("file:./data/orbweaver.db"),
    // The built client bundle (`vite build` output) the SPA registrar serves in prod. cwd-relative like
    // ASSETS_DIR (`pnpm start` runs at the repo root). Missing bundle: prod boot-fatal, dev skipped.
    CLIENT_DIST_DIR: z.string().min(1).default("./packages/client/dist"),
    // Content-addressed asset blob root (card PNGs, avatars); the DB holds metadata, bytes live here.
    ASSETS_DIR: z.string().min(1).default("./data/assets"),
    // The controlled root the bundle-import extractor stages its per-upload dir under (a portability zip
    // decompresses to disk, not RAM). Unset ⇒ the OS temp dir.
    IMPORT_STAGING_DIR: z.string().min(1).optional(),
    // The staged ST profile snapshot the `import-st` workload reads (one subdir per ST user profile, each
    // with characters/chats/settings.json/User Avatars). Unset ⇒ repo-root `.st-data`.
    ST_PROFILE_DIR: z.string().min(1).optional(),

    // The local inference family (embed/rerank/image-embed/summarize/VL gen), supervised loopback engines.
    // STACK_ENGINES=yes signals the stack leader already spawned them (adopt, don't double-spawn GPU).
    STACK_ENGINES: z.enum(["yes", "no"]).default("no"),
    // The host the three engines are REACHED at (engineBaseUrl + the egress internal-backend allowlist).
    // Default loopback: the bare-metal/all-in-one fleet shares the network namespace. A slim app-only
    // deployment pointing at an EXTERNAL vLLM (compose sibling / remote box — profile-2/D2,
    // docs/design/containerize-prod-image-spec.md §3.6) relocates it, typically with
    // ENGINES_POSTURE=adopt-only. Host-only (no scheme/port): VLLM_*_PORT stays the port authority.
    VLLM_ENGINE_HOST: z.string().min(1).default("127.0.0.1"),
    VLLM_EMBED_PORT: z.coerce.number().int().positive().default(VLLM_EMBED_PORT_DEFAULT),
    VLLM_RERANK_PORT: z.coerce.number().int().positive().default(VLLM_RERANK_PORT_DEFAULT),
    VLLM_GEN_PORT: z.coerce.number().int().positive().default(VLLM_GEN_PORT_DEFAULT),
    VLLM_EMBED_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Embedding-2B"),
    VLLM_RERANK_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Reranker-2B"),
    VLLM_GEN_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-8B-Instruct"),
    // The gen engine's context window (--max-model-len). The resolved vllm ModelCapability.context.window
    // reads this so the launcher flag and the fit ceiling share ONE home (text-parity tested vs the script).
    VLLM_GEN_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_GEN_MAX_MODEL_LEN_DEFAULT),
    // The embed/rerank pooling windows (--max-model-len). ONE home for the 8192 that was hand-copied into
    // the shell + the character embed-text budget + the local-light capability window; the engines
    // self-report these too and the self-report WINS for capability truth (D68 absence-degrades to here).
    VLLM_EMBED_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_EMBED_MAX_MODEL_LEN_DEFAULT),
    VLLM_RERANK_MAX_MODEL_LEN: z.coerce.number().int().positive().default(VLLM_RERANK_MAX_MODEL_LEN_DEFAULT),
    // Per-engine --gpu-memory-utilization floors + the two max_pixels caps + the embed request timeout —
    // the LAUNCH-config env floors an admin AppSettings override can move (layer.ts). Formerly bare literals
    // in scripts/dev/vllm-engine.sh; now single-homed here so the builder + the launcher share one truth.
    // RENAME NOTE (2026-07-24 #14): the old shell's `VLLM_GEN_UTIL` co-tenancy knob (one value overriding
    // the gen util in both GPU modes) is RETIRED — its function split into VLLM_GEN_GPU_UTIL_MULTI/_SINGLE
    // below (env-default argv is byte-identical to the old shell; a deployment that exported VLLM_GEN_UTIL
    // must move to the split vars or the admin override).
    VLLM_EMBED_GPU_UTIL: z.coerce.number().positive().default(VLLM_EMBED_GPU_UTIL_DEFAULT),
    VLLM_RERANK_GPU_UTIL_MULTI: z.coerce.number().positive().default(VLLM_RERANK_GPU_UTIL_MULTI_DEFAULT),
    VLLM_RERANK_GPU_UTIL_SINGLE: z.coerce.number().positive().default(VLLM_RERANK_GPU_UTIL_SINGLE_DEFAULT),
    VLLM_GEN_GPU_UTIL_MULTI: z.coerce.number().positive().default(VLLM_GEN_GPU_UTIL_MULTI_DEFAULT),
    VLLM_GEN_GPU_UTIL_SINGLE: z.coerce.number().positive().default(VLLM_GEN_GPU_UTIL_SINGLE_DEFAULT),
    VLLM_POOLING_MAX_PIXELS: z.coerce.number().int().positive().default(VLLM_POOLING_MAX_PIXELS_DEFAULT),
    VLLM_GEN_MAX_PIXELS: z.coerce.number().int().positive().default(VLLM_GEN_MAX_PIXELS_DEFAULT),
    // The gen engine's --override-generation-config repetition_penalty (#23) — the LAUNCH default that stops
    // the Qwen3-VL 1.0-penalty output-cap loop on the sampler-less agent-sdk wire. Admin-layerable + restart.
    VLLM_GEN_REPETITION_PENALTY: z.coerce.number().positive().default(VLLM_GEN_REPETITION_PENALTY_DEFAULT),
    // The gen engine's per-REQUEST presence-penalty default (Phase B ⑩ item 7) — applied by the vLLM chat
    // surface when a preset is silent. Admin-layerable ⊕ AppSettings override; OpenAI presence_penalty range.
    VLLM_GEN_PRESENCE_PENALTY: z.coerce.number().default(VLLM_GEN_PRESENCE_PENALTY_DEFAULT),
    // The agent-sdk backend's max in-flight summarize calls (Phase B ⑩ item 1, Q6). Admin-layerable ⊕ override.
    AGENT_SDK_SUMMARIZE_CONCURRENCY: z.coerce.number().int().positive().default(AGENT_SDK_SUMMARIZE_CONCURRENCY_DEFAULT),
    VLLM_EMBED_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(VLLM_EMBED_REQUEST_TIMEOUT_MS_DEFAULT),
    VLLM_EMBED_DIM: z.coerce.number().int().positive().default(VLLM_EMBED_DIM_DEFAULT),
    VLLM_EMBED_CHUNK_SIZE: z.coerce.number().int().positive().default(VLLM_EMBED_CHUNK_DEFAULT),
    // DEPLOYMENT facts (binary + cache stores) the engine SPAWNER resolves — all optional, unset ⇒ the
    // in-repo/venv defaults derived from the shared store root (buildEngineSpawnSpec). VLLM_BIN/VLLM_PY: the
    // Docker image pins system paths; VLLM_STORE_ROOT overrides the git-common-dir worktree derivation;
    // HF_HOME/VLLM_CACHE_ROOT relocate the multi-GB caches.
    VLLM_BIN: z.string().min(1).optional(),
    VLLM_PY: z.string().min(1).optional(),
    VLLM_STORE_ROOT: z.string().min(1).optional(),
    HF_HOME: z.string().min(1).optional(),
    VLLM_CACHE_ROOT: z.string().min(1).optional(),
    // Emit `--enable-sleep-mode` on every engine + set VLLM_SERVER_DEV_MODE=1 on the child (unlocks the
    // loopback /sleep · /wake_up · /is_sleeping endpoints). Default on: force-enables vLLM's cumem allocator
    // (steady-state inference cost ≈ nil) so an idle GPU can be reclaimed via /sleep. "false" reverts to the
    // pre-sleep launch (no endpoints, no idle reclaim). LAUNCH-tier (argv-affecting, restart-to-apply) —
    // resolved into EngineLaunchConfig.sleepMode via engineLaunchEnvFloor (override ?? floor).
    VLLM_SLEEP_MODE: envBool(true),
    // The ENGINE-SIDE flight recorder (default off). "true" ⇒ the serve argv gains `--enable-log-requests
    // --enable-log-outputs --max-log-len 2048`: wire captures show what WE sent, these show what the engine
    // PARSED (post-chat-template, post-tool-parser) — the tool-call-debugging blind spot. LAUNCH-tier
    // (argv-affecting, restart-to-apply). Verbose — leave off except when diagnosing a prompt/tool-parse gap.
    VLLM_DEBUG_REQUESTS: envBool(false),
    // `--shutdown-timeout N` — a graceful in-flight drain window (seconds) on engine shutdown. 0 (default) =
    // today's immediate abort; a positive value lets `engines:stop` drain first. LAUNCH-tier.
    VLLM_SHUTDOWN_TIMEOUT_S: z.coerce.number().int().nonnegative().default(0),
    // The ONE engine topology knob (A.4), replacing the VLLM_DISABLED/STACK_ENGINES combo folklore:
    //   off            — backend not registered, no supervisor (GPU-less / cloud-only box).
    //   adopt-only     — supervisor ADOPTS healthy engines, NEVER spawns; engines down → honest fail-fast.
    //                    Passive consumer (no auto-sleep management; on-demand wake allowed). snap/e2e/alt.
    //   adopt-or-start — fleet MANAGER: adopts when healthy, triggers the detached spawner when down, owns
    //                    restart/breaker + the auto-sleep timer. The dev/prod server.
    // Unset ⇒ resolved from the DEPRECATED VLLM_DISABLED/STACK_ENGINES pair with a visible log (resolveEnginesPosture).
    ENGINES_POSTURE: z.enum(ENGINES_POSTURES).optional(),
    // The manager-posture auto-sleep idle window (ms) — an idle engine (running==0 && waiting==0 && success
    // counters unchanged) is /sleep'd after this. `0` disables. Default 10 min: wake is seconds (cheap to be
    // wrong toward shorter), but in-chat thinking pauses routinely hit 5 min, so 10 keeps a live session warm
    // while reclaiming the GPU within a coffee break of walking away. AppSettings-tier override applies.
    VLLM_AUTO_SLEEP_IDLE_MS: z.coerce.number().int().nonnegative().default(VLLM_AUTO_SLEEP_IDLE_MS_DEFAULT),
    // DEPRECATED-BY ENGINES_POSTURE (mapped with a visible log by resolveEnginesPosture, then removed):
    // "true" disables the local engine entirely (a GPU-less/cloud-only box runs without the supervisor).
    VLLM_DISABLED: envBool(false),

    // Cross-chat corpus auto-indexing: embed completed raw-message blocks into the search corpus in the
    // background, post-turn. "false" pauses it to offload the GPU.
    CORPUS_AUTOINDEX: envBool(true),
    // Comma-separated character names (case-insensitive) to exclude at import. Set to "" to import all.
    IMPORT_SKIP_CHARACTERS: z.string().default("Wren,Assistant"),

    DEFAULT_USER_HANDLE: z.string().min(1).default("owner"),
    // single-user (default, no SSO) | local (app-stored password, cookie/BFF sessions) | forward-header
    // (proxy forward-auth) | oidc (the app is an OIDC client, cookie/BFF sessions).
    AUTH_MODE: z.enum(AUTH_MODES).default("single-user"),
    // What an un-credentialed request gets. owner (default) → the owner; deny → 401. In an SSO mode the
    // owner fallback is origin-gated (granted only on a local origin, never the public FQDN).
    AUTH_FALLBACK: z.enum(["owner", "deny"]).default("owner"),
    // Extra hostnames treated as a trusted local origin for the owner fallback in SSO modes. The public
    // FQDN must never be listed.
    TRUSTED_LOCAL_HOSTS: z.string().optional(),
    // Extra CIDR ranges added to the built-in private set for the local-origin owner-fallback gate AND the
    // trusted-proxy gate.
    TRUSTED_PRIVATE_RANGES: z.string().optional(),

    // Seeds the owner account's password on first boot (idempotent after). Required in local mode.
    LOCAL_INITIAL_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH).optional(),

    // Required to enable the unsigned trusted-header path. Unset ⇒ that path is fail-closed (raw identity
    // headers are rejected). The signed-JWT authentik path is unaffected.
    FORWARD_AUTH_TRUSTED_PROXIES: z.string().optional(),
    FORWARD_AUTH_USER_HEADER: z.string().min(1).optional(),
    FORWARD_AUTH_GROUPS_HEADER: z.string().min(1).optional(),
    FORWARD_AUTH_UID_HEADER: z.string().min(1).optional(),
    FORWARD_AUTH_EMAIL_HEADER: z.string().min(1).optional(),

    // A request from outside this comma CIDR list (and outside loopback) gets a 403 before any auth runs.
    IP_ALLOWLIST: z.string().optional(),

    // Blocks outbound HTTP to private/loopback/link-local IPs via the global undici dispatcher.
    EGRESS_FIREWALL: envBool(true),
    EGRESS_ALLOWLIST: z.string().optional(),

    // An identity whose groups contains OWNER_GROUP, or whose handle is in OWNER_HANDLES, provisions as
    // the owner. OWNER_HANDLES unset ⇒ [DEFAULT_USER_HANDLE].
    OWNER_GROUP: z.string().min(1).optional(),
    // Exactly one handle. A multi-handle comma-list is boot-fatal (the box has a single owner).
    OWNER_HANDLES: z.string().optional(),
    // OIDC_ADMIN_GROUPS: CSV of IdP groups that grant admin. OIDC_ALLOWED_GROUPS: CSV login-access gate —
    // an authenticated user in none of these groups is denied login. Unset ⇒ all users allowed.
    OIDC_ADMIN_GROUPS: z.string().optional(),
    OIDC_ALLOWED_GROUPS: z.string().optional(),

    // Verify the signed JWT against its JWKS. Falls back to network-isolation trust if the JWT is absent.
    FORWARD_AUTH_VERIFY_JWT: envBool(true),
    // A remote JWKS URL is always required https; if this allowlist is set its host must also be in it.
    FORWARD_AUTH_JWKS_ALLOWLIST: z.string().optional(),
    FORWARD_AUTH_JWT_ISSUER: z.string().optional(),
    FORWARD_AUTH_JWT_AUDIENCE: z.string().optional(),

    // 32 random bytes for AES-256-GCM (hex or base64). Unset ⇒ per-user creds off — no host-key fallback.
    CREDENTIALS_KEY: z.string().optional(),
    // When CREDENTIALS_KEY is unset, auto-generate + persist a key on first boot.
    CREDENTIALS_KEY_AUTO: envBool(false),

    // Required iff AUTH_MODE=oidc. OIDC_REDIRECT_URIS is a comma-list allowlist of the full callback URLs;
    // the login route derives the callback from the request origin and accepts it only on exact match.
    OIDC_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URIS: z.string().min(1).optional(),
    // A8 — the human-facing IdP name shown on the login surface's "Continue with {name}" button. Served on
    // /api/auth/config; default is generic so an un-branded oidc box still reads sensibly.
    OIDC_PROVIDER_NAME: z.string().min(1).default("your identity provider"),
    // Provider-agnostic claim/scope mapping; defaults are authentik's shape. A claim name may be a
    // dot-path (e.g. user.memberOf) for nested claims.
    OIDC_SCOPES: z.string().min(1).default("openid profile email"),
    OIDC_USERNAME_CLAIM: z.string().min(1).default("preferred_username"),
    OIDC_UID_CLAIM: z.string().min(1).default("sub"),
    OIDC_GROUPS_CLAIM: z.string().min(1).default("groups"),
    OIDC_EMAIL_CLAIM: z.string().min(1).default("email"),
    // A4 — the groups-claim VALUE separator. An authentik property mapping may emit groups as a single
    // separator-joined string instead of a JSON array; `identityFromClaims` splits on this (default ';',
    // matching OpenWebUI's OAUTH_GROUPS_SEPARATOR). A single string with no separator is one group. Without
    // this, a ';'-joined mapping silently yields [] — which under OIDC_ALLOWED_GROUPS denies EVERY login.
    OIDC_GROUPS_SEPARATOR: z.string().min(1).default(";"),
    // A1 — OIDC JIT-provisioning switch. DEFAULT OFF (owner-ruled deny-by-default): when off, a first-login
    // OIDC identity that has NO existing users row (a NEW account) is refused — the box admits only identities
    // an admin already provisioned, plus the box owner by policy (never a "signup"). Distinct from
    // OIDC_ALLOWED_GROUPS, which gates WHO (new or existing) may log in; this gates WHETHER new rows appear at
    // all. SCOPE: gates OIDC JIT ONLY. forward-header provisioning is governed by the trusted proxy (which
    // already gated who reaches the app), never by this knob — the decision is resolved per-mode at the caller
    // and passed into the mode-agnostic `provisionIdentity` verb (ruled 2026-08-09).
    // UPGRADE CONSEQUENCE (owner-accepted): an OIDC deployment that relies on first-login JIT stops creating
    // accounts until OIDC_SIGNUP=on is set.
    OIDC_SIGNUP: envBool(false),
    // A2 — approval queue. DEFAULT OFF; when on, a first-time (non-owner) SSO user provisions `enabled:false`
    // and cannot sign in until an admin enables the account (Settings → Admin → Approvals). NOT a new role:
    // `validate` + the SSO callback already refuse a disabled row, so the enforcement already exists. The box
    // owner is never gated (it would lock the box out of itself).
    OIDC_REQUIRE_APPROVAL: envBool(false),
    // A5 — the RP back-channel logout endpoint (POST /api/auth/oidc/backchannel-logout). DEFAULT OFF; when on
    // the endpoint validates the IdP's signed `logout_token` against the issuer JWKS and revokes every session
    // row for the matching subject. No Redis dependency (unlike OpenWebUI, which degrades to a no-op without it).
    OIDC_BACKCHANNEL_LOGOUT: envBool(false),
    // HMAC-peppers the session tokenHash so a DB leak alone can't forge a session.
    SESSION_SECRET: z.string().min(MIN_SESSION_SECRET_CHARS).optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(RATE_LIMIT_WINDOW_MS_DEFAULT),
    RATE_LIMIT_AI_TURN: z.coerce.number().int().positive().default(RATE_LIMIT_AI_TURN_DEFAULT),
    RATE_LIMIT_PUBLIC_IP: z.coerce.number().int().positive().default(RATE_LIMIT_PUBLIC_IP_DEFAULT),
    RATE_LIMIT_AUTHED: z.coerce.number().int().positive().default(RATE_LIMIT_AUTHED_DEFAULT),
    RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(RATE_LIMIT_LOGIN_DEFAULT),
  })
  .superRefine((val, ctx) => {
    // Fail fast at boot if the selected mode lacks the credentials to run it — a misconfigured deploy must
    // not silently fall back to owner-on-the-public-FQDN. The per-mode requirement is a mapped-type Record
    // over AUTH_MODES (the string-union dispatch discipline), so a fifth mode fails `tsc` here instead of
    // silently requiring nothing.
    for (const key of AUTH_MODE_REQUIRED_ENV[val.AUTH_MODE]) {
      if (val[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when AUTH_MODE=${val.AUTH_MODE}`,
        });
      }
    }
    // The INCOHERENT PAIR — same fail-fast class as the two blocks above, for the same reason: a deploy
    // must never silently degrade. `single-user` has NO credential but the owner fallback (its resolver
    // always returns null — infra/auth/modes/single-user.ts), and `infra/auth/resolve` tests
    // `fallback === "owner"` BEFORE the mode's unconditional origin arm — so this combination
    // authenticates nobody and EVERY request 401s. Left unfenced it is a box that boots healthy and
    // serves no one, which is how it shipped as the container image's default env
    // (docs/reviews/security/2026-08-08-containerize-surface-review.md F1, three docs asserting the knob
    // was inert here). Scoped to the pair: `deny` stays the SSO modes' secure default.
    if (val.AUTH_MODE === "single-user" && val.AUTH_FALLBACK === "deny") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_FALLBACK"],
        message:
          "AUTH_FALLBACK=deny with AUTH_MODE=single-user leaves NO way to authenticate — single-user's only credential IS the owner fallback. Set AUTH_FALLBACK=owner, or pick an SSO mode (local/oidc/forward-header) where deny is the secure default.",
      });
    }
    // The box has exactly one owner. A multi-handle list would seed >1 owner row and hit the DB unique
    // index as a raw violation later — fail fast here with a clear message instead.
    if (val.OWNER_HANDLES !== undefined) {
      const handles = val.OWNER_HANDLES.split(",")
        .map((handle) => handle.trim())
        .filter((handle) => handle.length > 0);
      if (handles.length > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["OWNER_HANDLES"],
          message: `OWNER_HANDLES must name EXACTLY ONE owner (D17: the box has a single owner) — got ${handles.length}: ${handles.join(", ")}`,
        });
      }
    }
  });

/** The parsed, frozen env floor. Read down by every tier; the AUTH_MODE superRefine throws here (at
 *  module load) on a misconfigured deploy. */
export const env: Readonly<z.infer<typeof envSchema>> = Object.freeze(envSchema.parse(process.env));

/** The raw `process.env` snapshot — the baseline the agent-sdk child env builders spread. */
export function processEnvSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}

/** The engine LAUNCH-config env floor — the structural slice `resolveEngineLaunchConfig` layers an admin
 *  AppSettings override on top of. ONE place the launch env vars project into the builder's floor shape, so
 *  the supervisor + the standalone dev launcher read the SAME floor. */
export function engineLaunchEnvFloor(): {
  readonly VLLM_EMBED_MODEL: string;
  readonly VLLM_RERANK_MODEL: string;
  readonly VLLM_GEN_MODEL: string;
  readonly VLLM_EMBED_MAX_MODEL_LEN: number;
  readonly VLLM_RERANK_MAX_MODEL_LEN: number;
  readonly VLLM_GEN_MAX_MODEL_LEN: number;
  readonly VLLM_EMBED_GPU_UTIL: number;
  readonly VLLM_RERANK_GPU_UTIL_MULTI: number;
  readonly VLLM_RERANK_GPU_UTIL_SINGLE: number;
  readonly VLLM_GEN_GPU_UTIL_MULTI: number;
  readonly VLLM_GEN_GPU_UTIL_SINGLE: number;
  readonly VLLM_POOLING_MAX_PIXELS: number;
  readonly VLLM_GEN_MAX_PIXELS: number;
  readonly VLLM_GEN_REPETITION_PENALTY: number;
  readonly VLLM_GEN_PRESENCE_PENALTY: number;
  readonly VLLM_SLEEP_MODE: boolean;
  readonly VLLM_DEBUG_REQUESTS: boolean;
  readonly VLLM_SHUTDOWN_TIMEOUT_S: number;
  readonly VLLM_EMBED_PORT: number;
  readonly VLLM_RERANK_PORT: number;
  readonly VLLM_GEN_PORT: number;
} {
  return {
    VLLM_EMBED_MODEL: env.VLLM_EMBED_MODEL,
    VLLM_RERANK_MODEL: env.VLLM_RERANK_MODEL,
    VLLM_GEN_MODEL: env.VLLM_GEN_MODEL,
    VLLM_EMBED_MAX_MODEL_LEN: env.VLLM_EMBED_MAX_MODEL_LEN,
    VLLM_RERANK_MAX_MODEL_LEN: env.VLLM_RERANK_MAX_MODEL_LEN,
    VLLM_GEN_MAX_MODEL_LEN: env.VLLM_GEN_MAX_MODEL_LEN,
    VLLM_EMBED_GPU_UTIL: env.VLLM_EMBED_GPU_UTIL,
    VLLM_RERANK_GPU_UTIL_MULTI: env.VLLM_RERANK_GPU_UTIL_MULTI,
    VLLM_RERANK_GPU_UTIL_SINGLE: env.VLLM_RERANK_GPU_UTIL_SINGLE,
    VLLM_GEN_GPU_UTIL_MULTI: env.VLLM_GEN_GPU_UTIL_MULTI,
    VLLM_GEN_GPU_UTIL_SINGLE: env.VLLM_GEN_GPU_UTIL_SINGLE,
    VLLM_POOLING_MAX_PIXELS: env.VLLM_POOLING_MAX_PIXELS,
    VLLM_GEN_MAX_PIXELS: env.VLLM_GEN_MAX_PIXELS,
    VLLM_GEN_REPETITION_PENALTY: env.VLLM_GEN_REPETITION_PENALTY,
    VLLM_GEN_PRESENCE_PENALTY: env.VLLM_GEN_PRESENCE_PENALTY,
    VLLM_SLEEP_MODE: env.VLLM_SLEEP_MODE,
    VLLM_DEBUG_REQUESTS: env.VLLM_DEBUG_REQUESTS,
    VLLM_SHUTDOWN_TIMEOUT_S: env.VLLM_SHUTDOWN_TIMEOUT_S,
    VLLM_EMBED_PORT: env.VLLM_EMBED_PORT,
    VLLM_RERANK_PORT: env.VLLM_RERANK_PORT,
    VLLM_GEN_PORT: env.VLLM_GEN_PORT,
  };
}

/** The raw inputs the posture resolver reads (A.4): the incoming ENGINES_POSTURE knob + the two deprecated
 *  vars it falls back to. Consumers (compose/lifecycle) call resolveEnginesPosture with this + a log so the
 *  deprecation line lands in the boot log; foundation/env stays the pure process.env reader. */
export function enginesPostureInput(): { readonly posture: EnginesPosture | undefined; readonly vllmDisabled: boolean; readonly stackEngines: "yes" | "no" } {
  return { posture: env.ENGINES_POSTURE, vllmDisabled: env.VLLM_DISABLED, stackEngines: env.STACK_ENGINES };
}

/** The raw inputs the DIAGNOSTICS posture resolver reads — the three ops knobs that together decide who can
 *  look inside a running box and how much is there (`diagnostics.ts` holds the model). Same seam shape as
 *  `enginesPostureInput`: this file stays the pure `process.env` reader; `lifecycle` composes + logs. The
 *  TOKEN VALUE never leaves here — only whether one is set (`resolveDiagnosticsPosture` reduces it to a
 *  boolean immediately), so no caller of the posture can echo the secret. */
export function diagnosticsPostureInput(): DiagnosticsPostureInput {
  return { debugToken: env.DEBUG_TOKEN, ipAllowlist: env.IP_ALLOWLIST, wireCapture: env.WIRE_CAPTURE, rpgTrace: env.RPG_TRACE };
}

/** The DEPLOYMENT-fact env slice the engine spawner reads (binary + cache stores). All optional — unset ⇒
 *  the in-repo/venv defaults the spawner derives. Kept beside engineLaunchEnvFloor so the launch (flags) and
 *  deployment (paths) tiers each have ONE projection out of `env`. */
export function engineDeploymentEnv(): {
  readonly vllmBin?: string | undefined;
  readonly vllmPy?: string | undefined;
  readonly storeRoot?: string | undefined;
  readonly hfHome?: string | undefined;
  readonly vllmCacheRoot?: string | undefined;
} {
  return {
    vllmBin: env.VLLM_BIN,
    vllmPy: env.VLLM_PY,
    storeRoot: env.VLLM_STORE_ROOT,
    hfHome: env.HF_HOME,
    vllmCacheRoot: env.VLLM_CACHE_ROOT,
  };
}
