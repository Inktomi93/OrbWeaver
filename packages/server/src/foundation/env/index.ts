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
const MIN_SESSION_SECRET_CHARS = 32;
const MIN_PASSWORD_LENGTH = 8;
const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_GENERAL_DEFAULT = 120;
const RATE_LIMIT_AI_TURN_DEFAULT = 30;
const RATE_LIMIT_PUBLIC_IP_DEFAULT = 60;
const RATE_LIMIT_AUTHED_DEFAULT = 600;

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

    // Tenor gif-search API key. Optional — omit to disable gif search. First-boot-only: seeds the owner's
    // gif-search credential once; the key is resolved from the row at runtime, never re-read from env.
    TENOR_API_KEY: z.string().min(1).optional(),

    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    // Gates /api/_debug/*. Unset = off (404). Set (any value) to enable; a request must present it via
    // x-debug-token.
    DEBUG_TOKEN: z.string().min(1).optional(),
    // Opt-in for the rpg flight recorder (R-OBS). Default off ⇒ `RpgContext.trace` is unwired ⇒ zero-cost +
    // byte-identical turns. `on` wires the per-process ring recorder read host-only at /api/_debug/rpg/traces
    // (the drive kit forces it on via the `rpgTrace` compose dep, bypassing this env knob).
    RPG_TRACE: z.enum(["on", "off"]).default("off"),

    DATABASE_URL: z.string().min(1).default("file:./data/orbweaver.db"),
    // The built client bundle (`vite build` output) the SPA registrar serves in prod. cwd-relative like
    // ASSETS_DIR (`pnpm start` runs at the repo root). Missing bundle: prod boot-fatal, dev skipped.
    CLIENT_DIST_DIR: z.string().min(1).default("./packages/client/dist"),
    // Escape-hatch override for the shipped curated pose-library root (comfyui-control §4.12, C6d). Unset ⇒
    // DERIVED from the served static root (CLIENT_DIST_DIR/poses/library in prod, packages/client/public in
    // dev) — `resolvePoseLibraryRoot`. Set to point the ComfyUI arm's pose-byte reader elsewhere.
    POSE_LIBRARY_DIR: z.string().min(1).optional(),
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
    VLLM_EMBED_DIM: z.coerce.number().int().positive().default(VLLM_EMBED_DIM_DEFAULT),
    VLLM_EMBED_CHUNK_SIZE: z.coerce.number().int().positive().default(VLLM_EMBED_CHUNK_DEFAULT),
    // "true" disables the local engine entirely (a GPU-less/cloud-only box runs without the supervisor).
    VLLM_DISABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // The owner-configured LOCAL ComfyUI image-generation endpoint (MA-8/D96). The H1 "their URL, their
    // onus" posture: reached over safeFetch's owner-configured-endpoint egress class (host-pinned, defers
    // SSRF to the global firewall). Default = the docker-compose loopback. Unconfigured/unreachable ⇒ an
    // honest capability absence, never a hang.
    COMFYUI_BASE_URL: z.string().min(1).default("http://localhost:8188"),

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
    RATE_LIMIT_GENERAL: z.coerce.number().int().positive().default(RATE_LIMIT_GENERAL_DEFAULT),
    RATE_LIMIT_AI_TURN: z.coerce.number().int().positive().default(RATE_LIMIT_AI_TURN_DEFAULT),
    RATE_LIMIT_PUBLIC_IP: z.coerce.number().int().positive().default(RATE_LIMIT_PUBLIC_IP_DEFAULT),
    RATE_LIMIT_AUTHED: z.coerce.number().int().positive().default(RATE_LIMIT_AUTHED_DEFAULT),
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

/** The slash-free vLLM gen-model alias the local gen engine serves via `--served-model-name`. Claude Code
 *  can't resolve a model id containing "/", so an `agent-sdk × vllm` turn (mode-3) must name this leaf, NOT a
 *  Claude default. ONE home for the derivation: BOTH the agent-sdk env firewall (buildClaudeVllmEnv's
 *  ANTHROPIC_DEFAULT_*_MODEL) and the connection model-heal (healModel's agent-sdk+vllm arm) read it here, so
 *  the runner env and the resolved requestedModel can't drift on the alias. */
export function vllmAgentModelAlias(): string {
  return env.VLLM_GEN_MODEL.split("/").pop() ?? env.VLLM_GEN_MODEL;
}
