// The one `process.env` reader: the dotenv load, the zod envSchema parse, the AUTH_MODE superRefine
// boot-fatality, the frozen `env`, and the raw processEnvSnapshot() baseline the agent-sdk credential
// firewall spreads into its child.
//
// Every other tier imports `env` and dot-accesses a typed key. This file is the sole place that touches
// process.env; never written, parsed once, frozen, read down as the floor.

import process from "node:process";
import { AUTH_MODES } from "@orb/contracts/identity";
import { LOG_LEVELS } from "@orb/contracts/settings";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

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
const VLLM_GEN_GPU_UTIL_MULTI_DEFAULT = 0.28;
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
const MIN_SESSION_SECRET_CHARS = 32;
const MIN_PASSWORD_LENGTH = 8;
const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_AI_TURN_DEFAULT = 30;
const RATE_LIMIT_PUBLIC_IP_DEFAULT = 60;
const RATE_LIMIT_AUTHED_DEFAULT = 600;
const RATE_LIMIT_LOGIN_DEFAULT = 10;

// Load a local .env before parsing. override:true so a checked-in dev .env wins over a stale shell
// export. Two escape hatches (VITEST, ORB_ENV_NO_OVERRIDE=1) keep the override from fighting a one-off
// invocation that wants its own shell vars honored.
const skipOverride = process.env["VITEST"] !== undefined || process.env["ORB_ENV_NO_OVERRIDE"] !== undefined;
loadDotenv({ override: !skipOverride, quiet: true });

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
    // "true" disables the local engine entirely (a GPU-less/cloud-only box runs without the supervisor).
    VLLM_DISABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Cross-chat corpus auto-indexing: embed completed raw-message blocks into the search corpus in the
    // background, post-turn. "false" pauses it to offload the GPU.
    CORPUS_AUTOINDEX: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // Comma-separated character names (case-insensitive) to exclude at import. Set to "" to import all.
    IMPORT_SKIP_CHARACTERS: z.string().default("Ruby,Assistant"),

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
    EGRESS_FIREWALL: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
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
    FORWARD_AUTH_VERIFY_JWT: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // A remote JWKS URL is always required https; if this allowlist is set its host must also be in it.
    FORWARD_AUTH_JWKS_ALLOWLIST: z.string().optional(),
    FORWARD_AUTH_JWT_ISSUER: z.string().optional(),
    FORWARD_AUTH_JWT_AUDIENCE: z.string().optional(),

    // 32 random bytes for AES-256-GCM (hex or base64). Unset ⇒ per-user creds off — no host-key fallback.
    CREDENTIALS_KEY: z.string().optional(),
    // When CREDENTIALS_KEY is unset, auto-generate + persist a key on first boot.
    CREDENTIALS_KEY_AUTO: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Required iff AUTH_MODE=oidc. OIDC_REDIRECT_URIS is a comma-list allowlist of the full callback URLs;
    // the login route derives the callback from the request origin and accepts it only on exact match.
    OIDC_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URIS: z.string().min(1).optional(),
    // Provider-agnostic claim/scope mapping; defaults are authentik's shape. A claim name may be a
    // dot-path (e.g. user.memberOf) for nested claims.
    OIDC_SCOPES: z.string().min(1).default("openid profile email"),
    OIDC_USERNAME_CLAIM: z.string().min(1).default("preferred_username"),
    OIDC_UID_CLAIM: z.string().min(1).default("sub"),
    OIDC_GROUPS_CLAIM: z.string().min(1).default("groups"),
    OIDC_EMAIL_CLAIM: z.string().min(1).default("email"),
    // HMAC-peppers the session tokenHash so a DB leak alone can't forge a session.
    SESSION_SECRET: z.string().min(MIN_SESSION_SECRET_CHARS).optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(RATE_LIMIT_WINDOW_MS_DEFAULT),
    RATE_LIMIT_AI_TURN: z.coerce.number().int().positive().default(RATE_LIMIT_AI_TURN_DEFAULT),
    RATE_LIMIT_PUBLIC_IP: z.coerce.number().int().positive().default(RATE_LIMIT_PUBLIC_IP_DEFAULT),
    RATE_LIMIT_AUTHED: z.coerce.number().int().positive().default(RATE_LIMIT_AUTHED_DEFAULT),
    RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(RATE_LIMIT_LOGIN_DEFAULT),
  })
  .superRefine((val, ctx) => {
    // Fail fast at boot if oidc is selected without the credentials to run it — a misconfigured deploy
    // must not silently fall back to owner-on-the-public-FQDN.
    if (val.AUTH_MODE === "oidc") {
      const required = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URIS", "SESSION_SECRET"] as const;
      for (const key of required) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when AUTH_MODE=oidc`,
          });
        }
      }
    }
    if (val.AUTH_MODE === "local") {
      for (const key of ["SESSION_SECRET", "LOCAL_INITIAL_PASSWORD"] as const) {
        if (val[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when AUTH_MODE=local`,
          });
        }
      }
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
    VLLM_EMBED_PORT: env.VLLM_EMBED_PORT,
    VLLM_RERANK_PORT: env.VLLM_RERANK_PORT,
    VLLM_GEN_PORT: env.VLLM_GEN_PORT,
  };
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

/** The slash-free vLLM gen-model alias the local gen engine serves via `--served-model-name`. Claude Code
 *  can't resolve a model id containing "/", so an `agent-sdk × vllm` turn (mode-3) must name this leaf, NOT a
 *  Claude default. ONE home for the derivation: BOTH the agent-sdk env firewall (buildClaudeVllmEnv's
 *  ANTHROPIC_DEFAULT_*_MODEL) and the connection model-heal (healModel's agent-sdk+vllm arm) read it here, so
 *  the runner env and the resolved requestedModel can't drift on the alias. */
export function vllmAgentModelAlias(): string {
  return env.VLLM_GEN_MODEL.split("/").pop() ?? env.VLLM_GEN_MODEL;
}
