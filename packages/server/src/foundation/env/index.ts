// foundation/env — THE one `process.env` reader (core/Tier-2-Foundation.md). The whole boot boundary:
// the dotenv load (override discipline + its two escape hatches), the zod `envSchema` parse, the
// AUTH_MODE `superRefine` BOOT-FATALITY, the frozen `env`, and the raw `processEnvSnapshot()` baseline
// the agent-sdk credential firewall spreads into its child (the firewall OWNS the denylist policy —
// ledger §2 / D8; env only produces the raw snapshot).
//
// Every other tier imports `env` and dot-accesses a typed key (`env.PORT`), satisfying tsc's
// noPropertyAccessFromIndexSignature. This file is the SOLE place that touches `process.env`
// (the `sole-env-reader` rule; the biome `noProcessEnv` override is scoped to this glob).
// NEVER written; parsed once, frozen, read down as the floor.

import process from "node:process";
import { AUTH_MODES } from "@orb/contracts/identity";
import { LOG_LEVELS } from "@orb/contracts/settings";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// ── Numeric floor defaults (named — `noMagicNumbers`) ────────────────────────────────────────────────
const DEFAULT_PORT = 8788;
// vLLM loopback engine ports (must match what the stack supervisor passes — one .env line moves both).
const VLLM_EMBED_PORT_DEFAULT = 8701;
const VLLM_RERANK_PORT_DEFAULT = 8702;
const VLLM_GEN_PORT_DEFAULT = 8703;
// The ONE MRL output dimension (Matryoshka) for the unified text+image embedding space (1024 matches
// every F32_BLOB(1024) vector column). Changing it invalidates existing vectors (a re-embed).
const VLLM_EMBED_DIM_DEFAULT = 1024;
// Client embed-batching CHUNK size (MEASURED throughput plateau — the CONCURRENCY companions are
// AppSettings, not boot env: ledger §2 "promote VLLM_*_CONCURRENCY to AppSettings").
const VLLM_EMBED_CHUNK_DEFAULT = 128;
// Session pepper strength: 32+ chars (HMAC pepper contract — sessions ride the cookie).
const MIN_SESSION_SECRET_CHARS = 32;
// Initial local-owner password floor (mirrors infra/auth password MIN_PASSWORD_LENGTH).
const MIN_PASSWORD_LENGTH = 8;
// Rate-limit budgets STAY boot-env (ledger §2 — hot-reloading a limiter is fiddly, rarely wanted). The
// per-window code floor neo carried (general 120 / aiTurn 30 / publicIp 60 / authed 600 per 60s); the
// DB-backed limiter primitive (transport/rate-limit, D35) is constructed off these at entry.
const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_GENERAL_DEFAULT = 120;
const RATE_LIMIT_AI_TURN_DEFAULT = 30;
const RATE_LIMIT_PUBLIC_IP_DEFAULT = 60;
const RATE_LIMIT_AUTHED_DEFAULT = 600;

// Load a local .env BEFORE parsing. override:true so a checked-in dev `.env` wins over a stale shell
// export (e.g. an old OPENROUTER_API_KEY lingering in the environment). In prod there is no .env file,
// so this is a no-op and the deployment's real env vars stand (.env is gitignored). Two escape hatches
// keep the override from fighting one-off invocations (core/Tier-2-Foundation.md esoteric #3):
//   • UNDER VITEST: override:false — the runner pins a deterministic auth env; .env's other keys still
//     load since they are absent from process.env.
//   • UNDER ORB_ENV_NO_OVERRIDE=1: override:false — the probe/one-off-server escape so
//     `DEBUG_TOKEN=… PORT=… tsx entry/index.ts` honors the shell vars.
const skipOverride =
  process.env["VITEST"] !== undefined || process.env["ORB_ENV_NO_OVERRIDE"] !== undefined;
loadDotenv({ override: !skipOverride, quiet: true });

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // OpenRouter (chat-completions + responses runners, non-Claude models). Optional — omit when running
    // on agent-sdk/max-pro-sub only. agent-sdk (Claude) needs NO key here — it authenticates via the
    // host's `claude login` Max subscription (infra/providers/backends/agent-sdk).
    OPENROUTER_API_KEY: z.string().min(1).optional(),

    // Observability (foundation/observability). LOG_LEVELS is the ONE tuple, imported DOWN from
    // @orb/contracts/settings (the hand-kept mirror is eliminated).
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    // Gates /api/_debug/*. UNSET = the introspection API is OFF (404). Set it (any value) to enable; a
    // request must then present it via `x-debug-token`. Keep unset in prod unless you want it reachable.
    DEBUG_TOKEN: z.string().min(1).optional(),

    // Database — the libSQL file URL (dev: a local file; prod: the mounted volume).
    DATABASE_URL: z.string().min(1).default("file:./orbweaver.db"),
    // Content-addressed asset blob root (card PNGs, avatars). A per-user-keyed sharded CAS tree (D21);
    // the DB holds metadata, bytes live here. Prod: a path on the mounted volume.
    ASSETS_DIR: z.string().min(1).default("./data/assets"),

    // ── vLLM family — THE local inference family (embed / rerank / image-embed / summarize / VL gen).
    // Supervised loopback engines adopted/owned by the in-server supervisor (infra/providers/vllm).
    // STACK_ENGINES=yes signals the stack leader already spawned them (adopt, don't double-spawn GPU).
    STACK_ENGINES: z.enum(["yes", "no"]).default("no"),
    VLLM_EMBED_PORT: z.coerce.number().int().positive().default(VLLM_EMBED_PORT_DEFAULT),
    VLLM_RERANK_PORT: z.coerce.number().int().positive().default(VLLM_RERANK_PORT_DEFAULT),
    VLLM_GEN_PORT: z.coerce.number().int().positive().default(VLLM_GEN_PORT_DEFAULT),
    // Model ids — also the provenance strings stored on rows produced by this family.
    VLLM_EMBED_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Embedding-2B"),
    VLLM_RERANK_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-Reranker-2B"),
    VLLM_GEN_MODEL: z.string().min(1).default("Qwen/Qwen3-VL-8B-Instruct"),
    VLLM_EMBED_DIM: z.coerce.number().int().positive().default(VLLM_EMBED_DIM_DEFAULT),
    VLLM_EMBED_CHUNK_SIZE: z.coerce.number().int().positive().default(VLLM_EMBED_CHUNK_DEFAULT),
    // The vLLM supervisor boot escape hatch (PRE-SCAFFOLD §D3): "true" disables the local engine entirely
    // (a GPU-less / cloud-only box runs without the supervisor). Default off.
    VLLM_DISABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Cross-chat corpus auto-indexing: embed completed raw-message blocks into the search corpus in the
    // background, post-turn. "true" (default) keeps the corpus fresh; "false" pauses it to offload the GPU.
    CORPUS_AUTOINDEX: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // Import curation: comma-separated character names (case-insensitive) to EXCLUDE at import (the card +
    // its chats are dropped). Default skips non-RP utility cards; set to "" to import all.
    IMPORT_SKIP_CHARACTERS: z.string().default("Wren,Assistant"),
    // No IMPORT_DEFAULT_SOURCE (PD-15 cleared): provenance is PER MESSAGE (each assistant message's `extra`
    // records its own model/api/tokens; D26 homes economics per-variant on `message_variants`), so import
    // maps each message's own recorded source — never a chat-level default. Do not re-add this var.

    // ── Auth / tenancy (spine/identity-auth-permission). The app only CONSUMES identity (never an IdP).
    // AUTH_MODE picks the SSO mechanism; AUTH_FALLBACK decides the un-credentialed case. Every var has a
    // safe default so the zero-infra single-user box runs untouched. ──
    // Owner handle: the single-user identity + the `owner` fallback + the bootstrap owner (D17). Set to
    // your SSO username so SSO and raw-LAN-IP fallback map to ONE user row.
    DEFAULT_USER_HANDLE: z.string().min(1).default("owner"),
    // The active auth mechanism. single-user (DEFAULT, no SSO) | local (app-stored password accounts,
    // cookie/BFF sessions) | forward-header (caddy+authentik/authelia forward-auth) | oidc (the app is an
    // OIDC client over HTTPS, cookie/BFF sessions).
    AUTH_MODE: z.enum(AUTH_MODES).default("single-user"),
    // What an UN-credentialed request gets. owner (DEFAULT) → the owner; deny → 401 (SSO mandatory). In an
    // SSO mode the `owner` fallback is ORIGIN-GATED (granted only on a local origin, never the public
    // FQDN) — that is what makes oidc+owner = "SSO on the domain AND owner on the raw LAN IP" SAFE.
    AUTH_FALLBACK: z.enum(["owner", "deny"]).default("owner"),
    // Extra hostnames (comma-list) treated as a trusted LOCAL origin for the owner fallback in SSO modes
    // (a raw-LAN path reached by name). The public FQDN must NEVER be listed.
    TRUSTED_LOCAL_HOSTS: z.string().optional(),
    // DEV/TEST ONLY: a credit-free scripted `runTurn` (infra/providers/scripted-override) so an e2e drives
    // a real turn without calling a model. Never set in a normal/production boot.
    RUNNER_OVERRIDE: z.string().optional(),
    // Extra CIDR ranges (comma-list) ADDED to the built-in private set for the local-origin owner-fallback
    // gate AND the trusted-proxy gate. Stock Tailscale + Docker are covered already; most deploys leave
    // this unset.
    TRUSTED_PRIVATE_RANGES: z.string().optional(),

    // ── local-password mode (AUTH_MODE=local) ──
    // Seeds the owner account's password on first boot (idempotent after). Required in `local` mode
    // (the superRefine below). Min length mirrors infra/auth.
    LOCAL_INITIAL_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH).optional(),

    // ── forward-header configurability (the authentik signed-JWT path is unchanged; these tune the
    //    UNSIGNED trusted-header path) ──
    FORWARD_AUTH_TRUSTED_PROXIES: z.string().optional(),
    FORWARD_AUTH_USER_HEADER: z.string().min(1).optional(),
    FORWARD_AUTH_GROUPS_HEADER: z.string().min(1).optional(),
    FORWARD_AUTH_UID_HEADER: z.string().min(1).optional(),

    // ── IP allowlist edge belt (orthogonal to AUTH_MODE; off by default) ──
    // Comma CIDR list; a request from outside it (and outside loopback, always allowed) gets a 403 before
    // any auth runs. Unset ⇒ disabled.
    IP_ALLOWLIST: z.string().optional(),

    // ── SSRF egress firewall ──
    // Blocks OUTBOUND HTTP to private/loopback/link-local IPs via the global undici dispatcher. Default ON.
    // EGRESS_ALLOWLIST is a comma host-list of internal hostnames allowed to resolve to a private IP.
    EGRESS_FIREWALL: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    EGRESS_ALLOWLIST: z.string().optional(),

    // Owner/admin determination (D17). An identity whose `groups` contains OWNER_GROUP, OR whose handle ∈
    // OWNER_HANDLES, provisions as the owner. OWNER_HANDLES unset ⇒ [DEFAULT_USER_HANDLE] (resolved at the
    // sessions consumer, not here). NOTE: removal does NOT auto-demote by default; the call-time
    // RE_DERIVE_ROLE_ON_LOGIN read lives in `sessions` (the allowlisted sole-env-reader exception), NOT
    // here — it wants per-test `vi.stubEnv` ergonomics the parsed-once `env` cannot give.
    OWNER_GROUP: z.string().min(1).optional(),
    // EXACTLY ONE handle (D17: one owner). A multi-handle comma-list is boot-fatal (the superRefine
    // below) — it would seed >1 owner row against `users_single_owner_unique`. Unset ⇒ [DEFAULT_USER_HANDLE].
    OWNER_HANDLES: z.string().optional(),

    // forward-header trust: verify the signed JWT against its JWKS (spoof-proof regardless of network
    // path). Default on; falls back to network-isolation trust if the JWT is absent.
    FORWARD_AUTH_VERIFY_JWT: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // JWKS hardening: the JWKS URL arrives in a REQUEST header (the one user-influenced egress vector). A
    // remote JWKS URL is ALWAYS required https; if this allowlist is set its host must also be in it.
    FORWARD_AUTH_JWKS_ALLOWLIST: z.string().optional(),
    // Optional expected iss/aud for the forwarded JWT — when set, verification enforces them.
    FORWARD_AUTH_JWT_ISSUER: z.string().optional(),
    FORWARD_AUTH_JWT_AUDIENCE: z.string().optional(),

    // Per-user credential encryption key — 32 random bytes for AES-256-GCM, hex or base64 (infra/crypto
    // decodes both). UNSET ⇒ per-user creds OFF (the store rejects writes; resolve throws the typed
    // no-credential error — there is NO host-key fallback). Validated for length in infra/crypto, NOT
    // here — a missing/short key must DEGRADE, never crash boot (core/Tier-2-Foundation.md "does NOT own").
    CREDENTIALS_KEY: z.string().optional(),
    // Opt-in auto-key: when CREDENTIALS_KEY is unset, infra/crypto auto-generates + persists a 32-byte key
    // to `<dirname(DATABASE_URL)>/.credentials-key` (mode 0o600) on first boot. Default off. env only
    // carries the toggle; the one-shot key path is infra/crypto's.
    CREDENTIALS_KEY_AUTO: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // OIDC client (required iff AUTH_MODE=oidc — the superRefine below). OIDC_REDIRECT_URIS is a comma-list
    // ALLOWLIST of permitted callback origins.
    OIDC_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URIS: z.string().optional(),
    // HMAC-peppers the session tokenHash so a DB leak alone can't forge a session. Required for the modes
    // that mint cookie sessions (oidc/local — enforced below).
    SESSION_SECRET: z.string().min(MIN_SESSION_SECRET_CHARS).optional(),

    // ── Rate-limit budgets (boot-env, ledger §2). The per-window code floor; the limiter primitive is
    //    built off these at entry (transport/rate-limit, D35). ──
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(RATE_LIMIT_WINDOW_MS_DEFAULT),
    RATE_LIMIT_GENERAL: z.coerce.number().int().positive().default(RATE_LIMIT_GENERAL_DEFAULT),
    RATE_LIMIT_AI_TURN: z.coerce.number().int().positive().default(RATE_LIMIT_AI_TURN_DEFAULT),
    RATE_LIMIT_PUBLIC_IP: z.coerce.number().int().positive().default(RATE_LIMIT_PUBLIC_IP_DEFAULT),
    RATE_LIMIT_AUTHED: z.coerce.number().int().positive().default(RATE_LIMIT_AUTHED_DEFAULT),
  })
  .superRefine((val, ctx) => {
    // Fail fast at boot if oidc is selected without the credentials to run it (a misconfigured deploy must
    // NOT silently fall back to owner-on-the-public-FQDN — a security incident). Other modes leave these
    // unset (the zero-infra default is untouched). core/Tier-2-Foundation.md esoteric #1 — survives byte-faithfully.
    if (val.AUTH_MODE === "oidc") {
      const required = [
        "OIDC_ISSUER",
        "OIDC_CLIENT_ID",
        "OIDC_CLIENT_SECRET",
        "OIDC_REDIRECT_URIS",
        "SESSION_SECRET",
      ] as const;
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
    // local-password mode needs the session pepper (sessions ride the cookie) and an initial owner password
    // to seed. Fail fast rather than boot an unusable login.
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
    // D17: the box has EXACTLY ONE owner (the box-credential/wallet holder; enforced by the DB partial
    // unique index `users_single_owner_unique`). OWNER_HANDLES is the bootstrap-owner allowlist, but a
    // MULTI-handle list would seed >1 owner row — the boot backfill loops every handle to role=owner and
    // the second write hits the index as a raw UNIQUE violation (boot throw). Fail fast HERE with a clear
    // message naming D17 + the offending handles, the AUTH_MODE boot-fatality precedent above. A single
    // handle (or unset ⇒ [DEFAULT_USER_HANDLE]) is the only structurally valid shape.
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

/** The parsed, frozen env floor. The ONE `envSchema.parse(process.env)` — read DOWN by every tier; the
 *  AUTH_MODE superRefine throws HERE (at module load) on a misconfigured deploy. */
export const env: Readonly<z.infer<typeof envSchema>> = Object.freeze(envSchema.parse(process.env));

/**
 * The raw `process.env` snapshot — the baseline the agent-sdk child env builders spread. It stays under
 * the single-reader roof because it reads `process.env`; WHICH keys the Claude child may not see is the
 * credential firewall's denylist policy (infra/providers/backends/agent-sdk), NOT env's (ledger §2 / D8).
 */
export function processEnvSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}
