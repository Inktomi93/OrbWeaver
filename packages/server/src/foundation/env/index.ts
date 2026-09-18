// The one `process.env` reader: the `.env` load, the zod envSchema parse, the AUTH_MODE superRefine
// boot-fatality, the frozen `env`, and the raw processEnvSnapshot() baseline the agent-sdk credential
// firewall spreads into its child.
//
// Every other tier imports `env` and dot-accesses a typed key. This file is the sole place that touches
// process.env; never written, parsed once, frozen, read down as the floor.

import { accessSync, constants, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { AUTH_MODES } from "@orb/contracts/identity";
import { AGENT_SDK_CONCURRENCY_MAX, LOG_LEVELS } from "@orb/contracts/settings";
import { z } from "zod";
import type { BindPostureInput } from "./bind.ts";
import { resolveBindPosture } from "./bind.ts";
import type { DiagnosticsPostureInput, OwnerFallbackCredentialInput } from "./diagnostics.ts";
import type { OwnerFallbackPeerInput } from "./fallback-peers.ts";
import { resolveOwnerFallbackPeers } from "./fallback-peers.ts";
import type { HostClaudeInput } from "./host-claude.ts";
import { CLAUDE_BACKEND_POSTURES, HOST_CLAUDE_OAUTH_TOKEN_ENV, hostClaudeConfigDir, hostClaudeCredentialsPath } from "./host-claude.ts";
import type { EnginesPosture } from "./posture.ts";
import { ENGINES_POSTURES } from "./posture.ts";

export type { BindPosture, BindPostureInput } from "./bind.ts";
export { bindPostureWarnings, resolveBindPosture } from "./bind.ts";
export type { DiagnosticsExposure, DiagnosticsPosture, DiagnosticsPostureInput, OwnerFallbackCredentialInput } from "./diagnostics.ts";
export { DIAGNOSTICS_EXPOSURES, diagnosticsPostureWarnings, resolveDiagnosticsPosture, resolveOwnerFallbackCredential } from "./diagnostics.ts";
export type { OwnerFallbackPeerInput, OwnerFallbackPeerPosture } from "./fallback-peers.ts";
export { ownerFallbackPeerWarnings, parseOwnerFallbackTrustedPeers, resolveOwnerFallbackPeers } from "./fallback-peers.ts";
export type { ClaudeBackendPosture, HostClaudeCredentialSource, HostClaudeInput, HostClaudePosture } from "./host-claude.ts";
export {
  CLAUDE_BACKEND_POSTURES,
  HOST_CLAUDE_CREDENTIAL_SOURCES,
  HOST_CLAUDE_CREDENTIALS_FILE,
  HOST_CLAUDE_OAUTH_TOKEN_ENV,
  hostClaudeConfigDir,
  hostClaudeCredentialsPath,
  hostClaudeNotice,
  hostClaudeWarnings,
  resolveHostClaudePosture,
} from "./host-claude.ts";
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
// The per-POST embed token ceiling (#187). DERIVED from a live measurement on the box's embed engine
// (Qwen3-VL-Embedding-2B, max_model_len 8192): ~15.1k prompt-tokens/s aggregate under 4-way concurrency, and
// 4.4k tok/s end-to-end for the request that queued behind three siblings. At 256k tokens a POST clears in
// ~60s at that worst-case rate — back inside the latency class the 120s default was written for — while four
// in flight bound any OTHER caller's queue wait to ~68s (a small POST measured 72.8s behind just two
// unbounded flood POSTs). Not a throttle: the whole flood still goes out, in schedulable units.
const VLLM_EMBED_MAX_BATCH_TOKENS_DEFAULT = 262_144;
// The gen engine's --max-model-len (buildEngineArgv `gen` arm). ONE home for the window so the launcher's
// serve flag and the resolved ModelCapability.context.window can't drift (parity-tested + engine-self-report
// outranks it for capability truth). The engine's OWN /v1/models max_model_len wins at runtime.
// 65_536 on a 262_144-native checkpoint (no rope scaling involved): at gen util 0.6 the KV pool is
// ~296k tokens, so 64k/request floors concurrency at ~4.5x — the owner-picked depth/parallelism trade
// (2026-08-18, for dense video analysis; 32k was 9x).
const VLLM_GEN_MAX_MODEL_LEN_DEFAULT = 65_536;
// The embed + rerank pooling engines' --max-model-len. ONE home for the 8192 that was hand-copied into the
// shell script's embed/rerank arms AND the character embed-text char budget AND the local-light capability
// window. The engines self-report these too (extend-of the gen-window seam); the env is the launch flag +
// the absence-degrade floor when the engine is warming/disabled.
const VLLM_EMBED_MAX_MODEL_LEN_DEFAULT = 8192;
const VLLM_RERANK_MAX_MODEL_LEN_DEFAULT = 8192;
// Per-engine --gpu-memory-utilization floors. RETUNED 2026-08-13 for the 27B-THINKING swap (W8A8-int8,
// TP=2): pooling engines squeezed to 0.1 each and moved to --enforce-eager (no CUDA-graph buffers — the
// graph overshoot is what the 08-10 measurements below caught), rerank re-homed to GPU1 so each card
// carries exactly ONE pooling tenant beside its gen half. Topology: GPU0 = embed(0.1)+gen(0.8) · GPU1 =
// gen(0.8)+rerank(0.1) — 0.9/card sum, deliberate. ⚠ UNVERIFIED until the first boot on this config.
const VLLM_EMBED_GPU_UTIL_DEFAULT = 0.14;
const VLLM_RERANK_GPU_UTIL_MULTI_DEFAULT = 0.14;
const VLLM_RERANK_GPU_UTIL_SINGLE_DEFAULT = 0.1;
// GEN HISTORY (keep — each number is paid tuition): 0.28 was the ComfyUI-coexistence floor (1.38x
// concurrency = ONE in-flight request; ComfyUI left, gen took the VRAM). 0.60 then OOM'd on vLLM 0.26
// during gen's CUDA-graph capture — died asking 2 MiB with 29 MiB free; measured residency: embed
// 7.68 GiB (0.14 budget → 0.162 actual), rerank 8.67 (0.16 → 0.183), gen 30.49 (0.60 → 0.643) — every
// engine overshoots its fraction ~2-4% ON GRAPHS, so 0.90-sum WITH graphs was fatal. gpu-memory-utilization
// is PER-INSTANCE (weights+KV), it reserves nothing for co-tenants. 2026-08-13, 27B swap: gen NEEDS 0.8
// for the int8 weights + usable KV; the 0.9/card sum is bought back by pooling going enforce-eager (kills
// the graph overshoot arm on the small engines). If first boot OOMs: drop gen 0.8 → 0.75 before touching
// the pooling floors, and re-measure — that retune IS the verification step.
const VLLM_GEN_GPU_UTIL_MULTI_DEFAULT = 0.6;
const VLLM_GEN_GPU_UTIL_SINGLE_DEFAULT = 0.5;
// --mm-processor-kwargs max_pixels caps: pooling engines (embed/rerank) at the reference 1.84M-px vision
// regime; the gen VL engine at its 4.2M-px cap. ONE home for the two literals the shell hand-carried.
const VLLM_POOLING_MAX_PIXELS_DEFAULT = 1_843_200;
const VLLM_GEN_MAX_PIXELS_DEFAULT = 4_194_304;
// Gen video sampling density — LAUNCH-TIME ONLY knobs (vLLM 0.26's per-request media/processor kwargs
// never reach the video sampler; probed live 2026-08-18). fps 4 doubles the Qwen3VL class default
// (temporal_patch_size 2 → the model sees fps×duration/2 timestamped steps); raise the env for
// frame-to-frame motion judgment, at ~2× vision tokens per fps step. max_frames caps one clip's
// token bill so a long video can't fill the whole context window (512 ≈ 2min @ fps 4).
const VLLM_GEN_VIDEO_FPS_DEFAULT = 4;
const VLLM_GEN_VIDEO_MAX_FRAMES_DEFAULT = 512;
// The gen engine's chunked-prefill step budget (--max-num-batched-tokens). 8_192 (vLLM's own
// chunked-prefill default) — NOT the old 2_096: one max-size image at VLLM_GEN_MAX_PIXELS is ~4_096
// vision tokens, and vLLM sizes the ENCODER CACHE off this budget, so 2_096 left the encoder window
// at one-image-at-a-time and multi-image prompts crawled (~90 tok/s prefill measured 2026-08-18 —
// reads as a hang). 8_192 holds two max-size images resident. Accepted trade: bigger prefill bites
// share steps with decode, so concurrent streams can get slightly chunkier under load.
const VLLM_GEN_MAX_BATCHED_TOKENS_DEFAULT = 8192;
// The gen engine's default repetition_penalty, applied PER REQUEST by the vLLM chat surface when a preset is
// silent (#23; the per-request move landed 2026-08-14). It was a `--override-generation-config` LAUNCH flag
// while the sampler-less agent-sdk /v1/messages wire existed — that wire carried no per-request penalty, so a
// 1.0-penalty model could loop to the output cap with no way to self-correct. The agent-sdk×vllm pairing was
// retired 2026-07-27 (roles/dispatch.ts fail-closes it) and every surviving vLLM surface sends samplers on
// the request, so baking it at launch only meant silently outranking the checkpoint's own
// generation_config.json on every call. 1.0 = the Qwen card value = no penalty (a preset value always wins;
// the loop-guard the prose path actually uses is presence_penalty). ONE home for the literal; env-layered ⊕
// AppSettings so an admin retune applies to the NEXT REQUEST — no engine restart.
const VLLM_GEN_REPETITION_PENALTY_DEFAULT = 1.0;
// The gen engine's default PRESENCE penalty applied per-REQUEST by the vLLM chat surface when a preset is
// silent (Phase B ⑩ item 7). Env-layered ⊕ AppSettings override so an admin can retune the per-launched-model
// default. OpenAI range -2..2.
// 2026-08-10: 1.5 → 0.0 with the THINKING-checkpoint swap. 1.5 was the Qwen3-VL-Instruct card value (the
// former hardcoded CARD_DEFAULT_PRESENCE_PENALTY) and it is Qwen's NON-THINKING number; the card gives
// presence_penalty 0.0 for both thinking modes. A presence penalty punishes reusing tokens already in
// context, which is exactly what a chain of thought does — restating constraints and repeating entity names
// across reasoning steps — so 1.5 pushed a thinking model off its own scratchpad vocabulary.
const VLLM_GEN_PRESENCE_PENALTY_DEFAULT = 0.0;
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
// (`path.resolve(process.cwd(), ".env")`), so a prod launch (`pnpm stack up prod` / `start-fg prod`, both
// cwd = repo root via buildProdSpawnPlan) keeps finding it.
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
/** The keys the loaded `.env` FILE declared (populated by `loadEnvFileWithOverride`). Provenance the parsed
 *  `env` can't carry: because the file loads with `override:true`, a value in `.env` wins over a launcher's
 *  export, so #301 needs to know which knobs the FILE pinned regardless of what the schema finally resolved.
 *  Empty when the file is absent/unreadable or skipped (`ORB_ENV_NO_FILE`, e.g. under vitest).
 *
 *  ASSUMES(single-replica) — and it holds BY CONSTRUCTION, so no DB-backed seam is warranted (unlike a
 *  per-request process cache, the shape this gate exists to catch). This Set is written EXACTLY ONCE, at
 *  module load, by the single `loadEnvFileWithOverride(...)` call at the bottom of this file; nothing mutates
 *  it per request, and its only reader is the #301 superRefine below. Every replica loads the SAME
 *  `.env` with `override:true` and computes byte-identical contents, so there is no cross-replica state to
 *  reconcile — it is boot-constant deployment provenance, not runtime accumulator state. */
const envFileKeys = new Set<string>();

function loadEnvFileWithOverride(override: boolean): void {
  // ORB_ENV_NO_FILE — skip the file ENTIRELY (not merely the override direction). Set globally by
  // vitest.config.ts: filling unset keys from a real `.env` makes a test assert against the operator's
  // deploy config rather than the schema default, which produced reds that were not regressions (see that
  // file's note). Distinct from ORB_ENV_NO_OVERRIDE below, which keeps the load and only flips precedence.
  if (process.env["ORB_ENV_NO_FILE"] !== undefined) {
    return;
  }
  let raw: string;
  // @orb-waive caught-failure-ownership(catch): a missing .env is a normal deploy state —
  // envFileKeys stays empty, correctly read by the #301 superRefine as "not declared". Ends
  // if the loader stops treating a missing file as absence rather than an error.
  try {
    raw = readFileSync(resolve(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(raw.startsWith(UTF8_BOM) ? raw.slice(UTF8_BOM.length) : raw))) {
    if (value !== undefined) {
      envFileKeys.add(key);
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/** #301 — the LAUNCH-ONLY env keys: a key here must NEVER appear in the app's own `.env` FILE, and the env
 *  superRefine makes that BOOT-FATAL (owner ruling 2026-08-19) rather than merely discouraged. The reason is
 *  the loader above: `.env` loads with `override:true`, so a value there is forced into EVERY launch from that
 *  directory — dev AND prod, every mode — which defeats "the prod launcher exports its own posture while dev
 *  falls to the schema default" and is a dev-lockout footgun besides. Each entry carries the sentence an
 *  operator needs to fix it; the generalized shape is what keeps a SECOND launch-time knob from arriving as a
 *  copy of the first predicate. */
const LAUNCH_ONLY_ENV_KEYS = [
  {
    key: "AUTH_FALLBACK",
    why: ".env's override:true would force it into every mode including dev (lockout risk). Leave it unset and it resolves per AUTH_MODE — 'owner' for single-user, 'deny' for local/oidc/forward-header; to override that, set it in the launcher's environment (`stack up prod` / `docker run -e`), never here.",
  },
  {
    key: "AUTH_FALLBACK_TRUSTED_PEERS",
    why: "it widens who is the un-credentialed OWNER, and .env's override:true would carry that widening into every launch from this directory — including a dev or prod run that never meant to open it. A container passes it in the CONTAINER environment (compose `environment:`/`docker run -e`), never in the app's own .env.",
  },
] as const;

/** The #301 refusal itself, lifted out of the superRefine so a THIRD launch-only knob costs one table row and
 *  no branch in the parse. Every declared key gets its own issue — an operator who pinned two sees two. */
function refuseLaunchOnlyEnvFileKeys(ctx: z.RefinementCtx): void {
  for (const entry of LAUNCH_ONLY_ENV_KEYS) {
    if (envFileKeys.has(entry.key)) {
      ctx.addIssue({ code: "custom", path: [entry.key], message: `${entry.key} must not be set in .env — ${entry.why}` });
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

/** What an UNSET `AUTH_FALLBACK` resolves to, PER MODE (#2406, 2026-09-18 — the conditional default). A
 *  mapped-type `Record` over `AUTH_MODES`, the same shape and for the same reason as the table above: a
 *  fifth mode fails `tsc` here and its author must state the value, instead of silently inheriting one.
 *
 *  WHY IT IS CONDITIONAL AND NOT ONE FLAT VALUE. The knob answers "what does an UN-CREDENTIALED request
 *  get", and the safe answer is genuinely different per mode, so a single default is wrong for half the
 *  deployments whichever way it points:
 *    • `single-user` has NO other credential — the peer-gated owner fallback IS the mode (the superRefine
 *      below refuses the `deny` pairing as a box that authenticates nobody). `deny` there is not
 *      fail-CLOSED, it is fail-DEAD: the box refuses to boot, so the value protects nothing, and the only
 *      thing a flat `deny` bought was a boot-fatal that every launcher, the vitest floor, the engines
 *      compose tool (a program that writes one file and exits) and every hermetic test that wipes
 *      `process.env` had to paper over with a pin for a value none of them care about (#1864's cost).
 *    • every SSO mode (`local`/`oidc`/`forward-header`) has its own credential, so an un-credentialed
 *      request must be DENIED — and it must be denied BY OMISSION, because #298's hole is a prod SSO
 *      deploy behind a same-host reverse proxy where every request is a loopback peer. That is the half
 *      #1864 was right about and it is preserved here EXACTLY: no SSO mode can reach `owner` implicitly.
 *  Both owner rulings therefore survive with their inputs unchanged — 2026-08-08 ("the image ships
 *  single-user + owner so a stranger's first run is usable with no setup") and #1864 2026-09-18 ("a prod
 *  deploy that omits AUTH_FALLBACK boots safely with SSO"). The refusals are untouched: an EXPLICIT `deny`
 *  under `single-user` and an EXPLICIT `owner` under a prod SSO mode are both still boot-fatal, and
 *  `AUTH_FALLBACK` in the `.env` FILE is still boot-fatal (#301) — the operator's own words are still
 *  judged, this table only decides what SILENCE means.
 *
 *  ENFORCER: `tests/server/foundation/env/index.test.ts` iterates `AUTH_MODES` and asserts the implicit
 *  value is `deny` for every mode but `single-user`, so a fifth mode added with the wrong row here is RED
 *  behaviorally as well as reviewed. */
const AUTH_MODE_DEFAULT_FALLBACK = {
  "single-user": "owner",
  local: "deny",
  oidc: "deny",
  "forward-header": "deny",
} as const satisfies Record<(typeof AUTH_MODES)[number], "owner" | "deny">;

/** The resolved `AUTH_FALLBACK`: the operator's explicit value when they stated one, else the per-mode
 *  default above. Called TWICE — once inside the superRefine (the break-glass × widened-peers refusal
 *  judges the EFFECTIVE value, not the declared one) and once in the schema's `.transform`, so the frozen
 *  `env` carries the resolved literal and no consumer has to re-derive it. */
function resolveAuthFallback(mode: (typeof AUTH_MODES)[number], declared: "owner" | "deny" | undefined): "owner" | "deny" {
  return declared ?? AUTH_MODE_DEFAULT_FALLBACK[mode];
}

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // The listen interface (`serve({ hostname })`). UNSET is the meaningful default and differs by build:
    // production ⇒ node's own default (every interface — what the reverse proxy target needs); NON-production
    // ⇒ loopback only, because a dev build must not be reachable off-box (bind.ts holds the model + the
    // 2026-08-09 incident it exists for). An EXPLICIT non-loopback value on a non-production build is
    // boot-fatal below unless ALLOW_DEV_PUBLIC_BIND says otherwise.
    BIND_HOST: z.string().min(1).optional(),
    // The deliberate-LAN-dev opt-in for the rule above. Default false. Never set this on the box that serves
    // the public FQDN: the public deployment runs `pnpm stack up prod` (NODE_ENV=production), where this knob
    // is inert by construction.
    ALLOW_DEV_PUBLIC_BIND: envBool(false),

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
    // `tooling/src/stack/stack.sh` (host export wins, so `DEV_SEED=off pnpm stack restart` rehearses a REAL first
    // sign-in). It enables the default-persona seeder's auto-create arm: without it every dev DB regen would
    // greet the operator with the forced first-run persona dialog, which is exactly the constraint that kept
    // the forced ask from shipping. Default off ⇒ a real deployment ASKS (D107's zero-personas trigger holds).
    // Deliberately NOT a `NODE_ENV` inference: this repo's env law is explicit natures, and "is this a dev
    // stack" is not the same question as "is this a development build".
    DEV_SEED: z.enum(["on", "off"]).default("off"),

    DATABASE_URL: z.string().min(1).default("file:./data/orbweaver.db"),
    // The built client bundle (`vite build` output) the SPA registrar serves in prod. cwd-relative like
    // ASSETS_DIR (a prod launch runs at the repo root — buildProdSpawnPlan sets cwd). Missing bundle: prod
    // boot-fatal, dev skipped.
    CLIENT_DIST_DIR: z.string().min(1).default("./packages/client/dist"),
    // Content-addressed asset blob root (card PNGs, avatars); the DB holds metadata, bytes live here.
    ASSETS_DIR: z.string().min(1).default("./data/assets"),
    // Where the in-process local-light tier (transformers.js/ONNX — the GPU-less box's embed/rerank/
    // imageEmbed/background-removal) downloads and keeps its model weights. cwd-relative like ASSETS_DIR.
    // It MUST be under the data root: transformers.js's own default is `node_modules/@huggingface/
    // transformers/.cache/`, which (a) is on the READ-ONLY rootfs in the container, so the first download
    // fails and local-light is dead for exactly the audience it exists for, and (b) on bare metal puts
    // multi-GB weights inside node_modules, where every `pnpm install` throws them away.
    LOCAL_LIGHT_CACHE_DIR: z.string().min(1).default("./data/models/transformers"),
    // Warm the local-light weights in the BACKGROUND just after the listener binds, instead of paying the
    // whole download on the first search/import/avatar. ON by default: the stranger who clones this repo and
    // runs it is exactly the person who would otherwise meet a several-minute stall with no explanation. Set
    // `off` on a metered/air-gapped box, or when the operator wants nothing fetched until something needs it
    // — the lazy path is unchanged either way, so `off` costs nothing but the first-use wait.
    LOCAL_LIGHT_PREFETCH: z.enum(["on", "off"]).default("on"),
    // The controlled root the bundle-import extractor stages its per-upload dir under (a portability zip
    // decompresses to disk, not RAM). Unset ⇒ the app-owned `DEFAULT_IMPORT_STAGING_DIR`
    // (`domain/import/substrate/staging.ts`), deliberately NOT the OS temp dir: a shared world-listable
    // namespace lets any other local process read an unconsumed upload's bytes. Whatever the root, each
    // upload stages under a PER-OWNER subdir of it (#1534) — the handle is a name, never a capability.
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
    VLLM_GEN_VIDEO_FPS: z.coerce.number().positive().default(VLLM_GEN_VIDEO_FPS_DEFAULT),
    VLLM_GEN_VIDEO_MAX_FRAMES: z.coerce.number().int().positive().default(VLLM_GEN_VIDEO_MAX_FRAMES_DEFAULT),
    VLLM_GEN_MAX_BATCHED_TOKENS: z.coerce.number().int().positive().default(VLLM_GEN_MAX_BATCHED_TOKENS_DEFAULT),
    // The gen engine's per-REQUEST repetition-penalty default (#23) — applied by the vLLM chat surface when a
    // preset is silent. Admin-layerable ⊕ AppSettings override; applies on the next request, no restart.
    VLLM_GEN_REPETITION_PENALTY: z.coerce.number().positive().default(VLLM_GEN_REPETITION_PENALTY_DEFAULT),
    // The gen engine's per-REQUEST presence-penalty default (Phase B ⑩ item 7) — applied by the vLLM chat
    // surface when a preset is silent. Admin-layerable ⊕ AppSettings override; OpenAI presence_penalty range.
    VLLM_GEN_PRESENCE_PENALTY: z.coerce.number().default(VLLM_GEN_PRESENCE_PENALTY_DEFAULT),
    // The agent-sdk backend's max in-flight summarize calls (Phase B ⑩ item 1, Q6). Admin-layerable ⊕ override.
    AGENT_SDK_SUMMARIZE_CONCURRENCY: z.coerce.number().int().positive().max(AGENT_SDK_CONCURRENCY_MAX).default(AGENT_SDK_SUMMARIZE_CONCURRENCY_DEFAULT),
    VLLM_EMBED_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(VLLM_EMBED_REQUEST_TIMEOUT_MS_DEFAULT),
    VLLM_EMBED_DIM: z.coerce.number().int().positive().default(VLLM_EMBED_DIM_DEFAULT),
    VLLM_EMBED_CHUNK_SIZE: z.coerce.number().int().positive().default(VLLM_EMBED_CHUNK_DEFAULT),
    // The per-POST TOKEN ceiling for embed batches (#187) — the bound `VLLM_EMBED_CHUNK_SIZE` (an item count)
    // cannot express. One POST of 128 near-window blocks is ~1M prompt tokens, which outlives any fixed
    // deadline and head-of-line blocks every other caller on the engine.
    VLLM_EMBED_MAX_BATCH_TOKENS: z.coerce.number().int().positive().default(VLLM_EMBED_MAX_BATCH_TOKENS_DEFAULT),
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
    // today's immediate abort; a positive value lets `engines stop` drain first. LAUNCH-tier.
    VLLM_SHUTDOWN_TIMEOUT_S: z.coerce.number().int().nonnegative().default(0),
    // The ONE engine topology knob (A.4), replacing the VLLM_DISABLED/STACK_ENGINES combo folklore:
    //   off            — backend not registered, no supervisor (GPU-less / cloud-only box).
    //   adopt-only     — supervisor ADOPTS healthy engines, NEVER spawns; engines down → honest fail-fast.
    //                    Passive consumer (no auto-sleep management; on-demand wake allowed). snap/e2e/alt.
    //   adopt-or-start — fleet MANAGER: adopts when healthy, triggers the detached spawner when down, owns
    //                    restart/breaker + the auto-sleep timer. The dev/prod server.
    // Unset ⇒ resolved from the DEPRECATED VLLM_DISABLED/STACK_ENGINES pair with a visible log (resolveEnginesPosture).
    ENGINES_POSTURE: z.enum(ENGINES_POSTURES).optional(),
    // The ONE host-Claude (agent-sdk / max-pro-sub) topology knob — the same explicit-posture shape as
    // ENGINES_POSTURE above, for the same reason (`host-claude.ts` holds the model + the 2026-09-18 incident):
    //   off  — the backend is never registered and the bundled claude runtime never spawns.
    //   auto — (default) registered when a subscription credential is DETECTED; otherwise absent and quiet.
    //   on   — registered on the operator's word (detection cannot see a macOS Keychain login); the first
    //          use runs the SDK's own auth probe.
    CLAUDE_BACKEND: z.enum(CLAUDE_BACKEND_POSTURES).optional(),
    // The Claude config dir the bundled runtime reads its login from (and `claude login` writes it to).
    // Unset ⇒ `homedir()/.claude`. A container sets it into the persisted data volume so a one-time
    // in-container `claude login` survives a restart. NOT a secret — a path.
    CLAUDE_CONFIG_DIR: z.string().min(1).optional(),
    // CLAUDE_CODE_OAUTH_TOKEN and ANTHROPIC_API_KEY are DELIBERATELY NOT PARSED HERE. Two reasons, both
    // load-bearing: (a) `env` is parsed once at module load and frozen, and a credential can arrive AFTER
    // boot (a container secret mounted late, `claude setup-token` exported into a restarted shell) — the
    // #1406 no-latch rule, which is why `hostClaudeInput()` below reads them live from the process
    // snapshot; (b) keeping a BEARER credential out of the frozen, widely-imported `env` object shrinks the
    // set of places that could ever echo it. Their one reader is `buildClaudeSdkEnv` (mode-1).
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
    // Comma-separated character names (case-insensitive) to exclude at import. Default: skip nothing — the
    // former "Ruby,Assistant" default was the owner's own library, and a stranger importing a card by either
    // name silently lost it (2026-09-18). Set per box in the env or the admin import settings.
    IMPORT_SKIP_CHARACTERS: z.string().default(""),

    DEFAULT_USER_HANDLE: z.string().min(1).default("owner"),
    // single-user (default, no SSO) | local (app-stored password, cookie/BFF sessions) | forward-header
    // (proxy forward-auth) | oidc (the app is an OIDC client, cookie/BFF sessions).
    AUTH_MODE: z.enum(AUTH_MODES).default("single-user"),
    // What an un-credentialed request gets: deny → 401; owner → the owner, gated on a LOOPBACK TCP peer
    // (#298 f2 — the unspoofable socket, NOT the client `Host`). OPTIONAL in the SCHEMA and resolved by
    // MODE in the `.transform` below (`AUTH_MODE_DEFAULT_FALLBACK`, #2406): unset ⇒ `owner` under
    // `single-user` (its only credential) and `deny` under every SSO mode. `undefined` here therefore means
    // "the operator said nothing", which is exactly the distinction the two refusals below need — they judge
    // the EXPLICIT value, so an implicit `owner` can never exist outside `single-user`. In production an SSO
    // mode with an explicit `owner` is BOOT-FATAL unless AUTH_BREAK_GLASS=true (see the superRefine): behind
    // a same-host reverse proxy every request arrives on a loopback socket, which would mint owner for
    // everyone and bypass SSO. READ AFTER THE PARSE, `env.AUTH_FALLBACK` is always the RESOLVED literal.
    AUTH_FALLBACK: z.enum(["owner", "deny"]).optional(),
    // BREAK-GLASS: deliberately permit the loopback-owner fallback in an otherwise-fatal prod SSO deploy (see
    // AUTH_FALLBACK). Default false (accepts only `true`/`false`, the house envBool vocabulary — `1`/`on` are
    // a loud boot refusal). `true` is the operator's acknowledgment for an on-box recovery session (SSH +
    // loopback curl); it unlocks the boot guard but does NOT itself enable the fallback — set AUTH_FALLBACK=owner
    // too. Revert both when recovery is done. Lifecycle logs a loud SECURITY warning while it is on.
    AUTH_BREAK_GLASS: envBool(false),
    // PROPOSED (containerize-prod-image-spec.md §3.1 arm (b)) — the documented, NON-DEFAULT opt-in that widens
    // the owner fallback's peer set beyond loopback: a comma CIDR list (v4/v6) whose peers are admitted IN
    // ADDITION to loopback. Unset (the default) is byte-identical to the loopback-only rule. It exists because
    // a container's published port never delivers a loopback peer, so `single-user` — whose ONLY credential is
    // that fallback — 401s every browser request in docker. READ `fallback-peers.ts` BEFORE SETTING IT: under
    // docker NAT this names a SOCKET, not a machine, and a port published on all interfaces turns "the bridge
    // range" into "the internet". LAUNCH-ONLY (a `.env` pin is boot-fatal, above) and refused beside
    // AUTH_BREAK_GLASS. Inert unless AUTH_FALLBACK=owner, so the prod SSO boot guard still governs it.
    AUTH_FALLBACK_TRUSTED_PEERS: z.string().optional(),
    // Extra CIDR ranges added to the built-in private set for the EGRESS/SSRF belt (infra/network/egress.ts).
    // NOT the auth fallback (that gates on the loopback peer only, #298 f2) and NOT the ingress trusted-proxy
    // gate (FORWARD_AUTH_TRUSTED_PROXIES owns that).
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
    // (docs/history/reviews/security/2026-08-08-containerize-surface-review.md F1, three docs asserting the knob
    // was inert here). Scoped to the pair: `deny` stays the SSO modes' secure default.
    // The condition reads the DECLARED value, so it fires only on an operator who TYPED `deny` here — an
    // unset key resolves to `owner` under this mode (`AUTH_MODE_DEFAULT_FALLBACK`) and never reaches it.
    if (val.AUTH_MODE === "single-user" && val.AUTH_FALLBACK === "deny") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_FALLBACK"],
        message:
          "AUTH_FALLBACK=deny with AUTH_MODE=single-user leaves NO way to authenticate — single-user's only credential IS the owner fallback. UNSET AUTH_FALLBACK (single-user resolves it to owner on its own), set it to owner explicitly, or pick an SSO mode (local/oidc/forward-header), where an unset AUTH_FALLBACK already resolves to the secure deny.",
      });
    }
    // THE SSO-FALLBACK LEAK (#298, owner ruling 2026-08-19) — same fail-fast class: a deploy must never
    // silently bypass SSO. In an SSO mode (anything but single-user) the loopback-peer owner fallback
    // (`ownerFallbackAllowed`, infra/auth/dispatch.ts) mints owner for any request arriving on a loopback
    // socket. That is exactly what a SAME-HOST reverse proxy produces: Caddy/nginx terminating on the box and
    // proxying to the app over 127.0.0.1 makes EVERY external user's request a loopback peer, so AUTH_FALLBACK=owner
    // would hand owner to the whole internet and OIDC/login would be bypassed for everyone. The signal is
    // `NODE_ENV==="production"`, chosen over two alternatives that are UNSOUND here:
    //   • a "behind a proxy" heuristic (FORWARD_AUTH_TRUSTED_PROXIES set, or an explicit flag) — forward-header-
    //     specific / usually unset under oidc / forgettable: a FALSE-NEGATIVE that leaves the hole open.
    //   • `bind.publicBind` (bind.ts) — DISQUALIFYING false-negative: a production app with `BIND_HOST=127.0.0.1`
    //     resolves `publicBind===false` (bind.ts:115), yet that is the EXACT hazard — a host-Caddy proxying to
    //     127.0.0.1 makes every external user a loopback peer while the app is loopback-bound. A publicBind gate
    //     would MISS the recommended "bind prod restrictively behind the proxy" topology. (It also false-HARMS:
    //     it would fatal a deliberate `ALLOW_DEV_PUBLIC_BIND` LAN-dev session, whose LAN-direct hits the peer
    //     gate already denies — no proxy in front — forcing deny and locking the dev owner out for no gain.)
    // Production is where the danger lives regardless of bind/topology; dev (NODE_ENV≠production, loopback-bound,
    // vite proxying over 127.0.0.1) is where AUTH_FALLBACK=owner is the legitimate frictionless auto-owner path,
    // and stays UNTOUCHED. The ONLY sanctioned prod exception is a deliberate on-box recovery session, opted into
    // with AUTH_BREAK_GLASS=true (which lifecycle then warns about loudly). Scoped to the leaky triple; `deny`
    // stays the SSO modes' secure prod default.
    //
    // OWNER RULING 2026-08-19 (the HELD discriminator decision): KEEP NODE_ENV, do NOT add a PUBLIC_DEPLOYMENT
    // flag. The ruling SURVIVES the launch-centralize consolidation (#309) — its INPUT changed: `pnpm start`
    // was removed, so BOTH supported prod launchers now route through `buildProdSpawnPlan`
    // (`tooling/src/stack/lib/spawn-plan.ts` — `env: {...inherited, NODE_ENV: "production", ...}`, in the spawn plan
    // itself, not just the status log): `pnpm stack up prod` (detached) and `pnpm stack start-fg prod`
    // (foreground). The discriminator bites on every real prod path even more cleanly than before; a second
    // flag would only be a source of disagreement. The one residual (a bare
    // hand-rolled `node entry/index.ts` that omits NODE_ENV, behind a loopback proxy, with default owner) is
    // ACCEPTED defense-in-depth risk, documented (containerize-prod-image-spec.md §4), not guarded — the
    // supported launchers all set it, and #301 makes the effective mode/fallback legible per launch.
    //
    // #2406: this reads the DECLARED value, and that is the whole safety argument for the conditional
    // default. An SSO mode's unset key resolves to `deny` (`AUTH_MODE_DEFAULT_FALLBACK`), so `owner` in an
    // SSO mode can ONLY come from an operator typing it — which is precisely what this refusal catches.
    // There is no path by which omission produces `owner` outside `single-user`.
    if (val.NODE_ENV === "production" && val.AUTH_MODE !== "single-user" && val.AUTH_FALLBACK === "owner" && !val.AUTH_BREAK_GLASS) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_FALLBACK"],
        message: `AUTH_FALLBACK=owner with AUTH_MODE=${val.AUTH_MODE} in production is a SSO BYPASS: behind a same-host reverse proxy every request arrives on a loopback socket and the owner fallback would mint owner for everyone, bypassing SSO. UNSET AUTH_FALLBACK — every SSO mode resolves it to deny, the secure prod value (the owner logs in via SSO, seeded at boot) — or set deny explicitly. For a deliberate on-box recovery session ONLY, set AUTH_BREAK_GLASS=true to acknowledge the risk.`,
      });
    }
    // #301 (owner ruling 2026-08-19) — AUTH_FALLBACK is a LAUNCH-TIME decision, NEVER a `.env` KEY, and this
    // makes the invariant IMPOSSIBLE to violate rather than merely discouraged (constitution §1: the apparatus
    // makes the shortcut impossible). The file loads with `override:true`, so a value in `.env` is forced into
    // EVERY launch from that dir — dev AND prod, every mode — which is a dev-lockout footgun (a prod-intended
    // `.env` run in dev, or an SSO mode + a pinned `deny`, kills dev's loopback auto-owner) and confusingly
    // collides downstream with the two prod fatals above. There is no legitimate `.env` pin: since #2406 the
    // per-mode default (`AUTH_MODE_DEFAULT_FALLBACK`) is already the value each mode wants — `owner` under
    // `single-user`, `deny` under every SSO mode — so a pin can only either restate it (deletable at zero
    // cost) or invert it for every launch from this directory at once. Same fail-fast family as the two
    // blocks above.
    // GENERALIZED: the rule is now a TABLE (`LAUNCH_ONLY_ENV_KEYS`) rather than one predicate, because
    // `AUTH_FALLBACK_TRUSTED_PEERS` is launch-only for the same reason with a different consequence — each
    // key carries its own operator sentence, and a third knob is a row, not a second copy of this block.
    refuseLaunchOnlyEnvFileKeys(ctx);
    // THE WIDENED FALLBACK PEER SET × BREAK-GLASS (PROPOSED — containerize-prod-image-spec.md §3.1 arm (b)).
    // Same fail-fast family as the blocks above, and the one combination the widening may never enter.
    // `AUTH_BREAK_GLASS=true` exists to unlock ONE thing: a brief, on-box, proxy-off recovery session in an
    // otherwise-fatal prod SSO deploy (§4 Break-glass). `AUTH_FALLBACK_TRUSTED_PEERS` widens exactly the
    // "on-box" half of that sentence — together they hand every peer in the named ranges the owner of a
    // production SSO box with no credential, which is #298's hole at network scale behind a flag whose own
    // documentation promises the opposite. The recovery procedure does not need the widening: it is run from
    // an on-box shell over the loopback listener, which the unwidened gate already admits.
    // Unlike the two refusals above, this one judges the RESOLVED value: `resolveOwnerFallbackPeers` asks
    // whether the widening is live, which is a fact about the running box, not about what the operator typed.
    if (
      val.AUTH_BREAK_GLASS &&
      resolveOwnerFallbackPeers({
        authFallback: resolveAuthFallback(val.AUTH_MODE, val.AUTH_FALLBACK),
        trustedPeers: val.AUTH_FALLBACK_TRUSTED_PEERS,
      }).ranges.length > 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_FALLBACK_TRUSTED_PEERS"],
        message:
          "AUTH_FALLBACK_TRUSTED_PEERS must not be combined with AUTH_BREAK_GLASS — break-glass is the brief ON-BOX recovery door (run it from a shell on the box, over the loopback listener, with the front proxy stopped). Widening its peer set hands every listed peer the owner of a production SSO deployment with no credential. Unset one of the two.",
      });
    }
    // THE DEPLOY-MODE INVARIANT (PROD-LEAK, 2026-08-09) — same fail-fast class again: a NON-PRODUCTION build
    // may not be bound where an untrusted network reaches it. Refusing at PARSE (rather than at the bind
    // site) is what makes the state unrepresentable: no code path can hold an `env` that says
    // "development + public interface". The rule itself lives in ONE home — `bind.ts::resolveBindPosture`,
    // which `entry/lifecycle` also calls for the host it actually binds — so the refusal and the bind can
    // never disagree.
    const bind = resolveBindPosture({ nodeEnv: val.NODE_ENV, bindHost: val.BIND_HOST, allowDevPublicBind: val.ALLOW_DEV_PUBLIC_BIND });
    if (bind.refusal !== null) {
      ctx.addIssue({ code: "custom", path: ["BIND_HOST"], message: bind.refusal });
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
  })
  // THE ONE RESOLUTION STEP, and it runs AFTER every refusal above on purpose: the refusals need to know
  // what the operator actually TYPED (an unset key is not a `deny` they chose), while every consumer of the
  // frozen `env` needs the EFFECTIVE value and must never re-derive it. Placing it here is what keeps
  // `AUTH_FALLBACK` a `"owner" | "deny"` for the whole tree — `infra/auth/config`, the two posture inputs
  // and `entry/lifecycle` all read it unchanged and no site branches on `undefined`.
  .transform((val) => ({ ...val, AUTH_FALLBACK: resolveAuthFallback(val.AUTH_MODE, val.AUTH_FALLBACK) }));

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
  readonly VLLM_GEN_VIDEO_FPS: number;
  readonly VLLM_GEN_VIDEO_MAX_FRAMES: number;
  readonly VLLM_GEN_MAX_BATCHED_TOKENS: number;
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
    VLLM_GEN_VIDEO_FPS: env.VLLM_GEN_VIDEO_FPS,
    VLLM_GEN_VIDEO_MAX_FRAMES: env.VLLM_GEN_VIDEO_MAX_FRAMES,
    VLLM_GEN_MAX_BATCHED_TOKENS: env.VLLM_GEN_MAX_BATCHED_TOKENS,
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

/** The raw inputs the BIND posture resolver reads (the deploy-mode invariant). Same seam shape as
 *  `enginesPostureInput` / `diagnosticsPostureInput`: this file stays the pure `process.env` reader, the
 *  rule lives in `bind.ts`, and `entry/lifecycle` composes + logs. The env parse above has ALREADY refused
 *  any combination whose posture carries a refusal, so a caller here is guaranteed a bindable verdict. */
export function bindPostureInput(): BindPostureInput {
  return { nodeEnv: env.NODE_ENV, bindHost: env.BIND_HOST, allowDevPublicBind: env.ALLOW_DEV_PUBLIC_BIND };
}

/** The raw inputs the DIAGNOSTICS posture resolver reads — the three ops knobs that together decide who can
 *  look inside a running box and how much is there (`diagnostics.ts` holds the model). Same seam shape as
 *  `enginesPostureInput`: this file stays the pure `process.env` reader; `lifecycle` composes + logs. The
 *  TOKEN VALUE never leaves here — only whether one is set (`resolveDiagnosticsPosture` reduces it to a
 *  boolean immediately), so no caller of the posture can echo the secret. */
export function diagnosticsPostureInput(): DiagnosticsPostureInput {
  return { debugToken: env.DEBUG_TOKEN, ipAllowlist: env.IP_ALLOWLIST, wireCapture: env.WIRE_CAPTURE, rpgTrace: env.RPG_TRACE };
}

/** The raw inputs the OWNER-FALLBACK credential rule reads (`diagnostics.ts::resolveOwnerFallbackCredential`
 *  holds the rule and the WHY). Same seam shape as `bindPostureInput`: this file stays the pure `process.env`
 *  reader; `entry/lifecycle` composes it into the auth seam, which owns no copy of the rule. */
export function ownerFallbackCredentialInput(): OwnerFallbackCredentialInput {
  return { nodeEnv: env.NODE_ENV, authFallback: env.AUTH_FALLBACK, fallbackWidened: resolveOwnerFallbackPeers(ownerFallbackPeerInput()).widened };
}

/** The raw inputs the HOST-CLAUDE posture resolver reads (`host-claude.ts` holds the model, the three arms
 *  and the incident). Same seam shape as `enginesPostureInput`, with ONE addition this file is the right
 *  home for: the credentials-file probe. It is ambient ENVIRONMENT exactly like a variable is — and it has
 *  to be read HERE because two callers (the backend-registration gate at compose and the mode-1 child-env
 *  builder in infra) must agree on the same answer, which a second probe site could not guarantee.
 *
 *  SECRET DISCIPLINE: only WHETHER a credential is set crosses this seam, never a value (the
 *  `diagnosticsPostureInput` rule). The token VALUE has exactly one reader — `buildClaudeSdkEnv` — and it
 *  takes it from `env` directly rather than through a posture nobody can log safely.
 *
 *  Re-read per call, never memoized: a credential can be mounted or created after boot (a container secret
 *  landing late, an operator running `claude login` on a live box) — the #1406 no-latch rule. */
export function hostClaudeInput(): HostClaudeInput {
  const configDir = hostClaudeConfigDir(env.CLAUDE_CONFIG_DIR, homedir());
  const live = processEnvSnapshot();
  return {
    posture: env.CLAUDE_BACKEND,
    anthropicApiKeySet: isSetNonEmpty(live["ANTHROPIC_API_KEY"]),
    oauthTokenSet: isSetNonEmpty(live[HOST_CLAUDE_OAUTH_TOKEN_ENV]),
    credentialsFileReadable: isReadableFile(hostClaudeCredentialsPath(configDir)),
    configDir,
  };
}

/** Set AND non-empty. An empty string is honestly "unset" — the entrypoint's `*_FILE` shim exports an empty
 *  value for an empty secret file, and treating that as a credential is how a box registers a backend that
 *  cannot log in. */
function isSetNonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

/** Is this path a readable FILE right now? `accessSync(R_OK)` rather than `existsSync`: a credentials file
 *  the app cannot read (wrong uid after a PUID/PGID drop, a bad bind-mount) is not a credential, and calling
 *  it one is how you get the spawn-that-can-only-fail back. Any failure is "no", never a throw. */
function isReadableFile(path: string): boolean {
  // @orb-waive caught-failure-ownership(catch): a probe whose ONLY verdict is a boolean — an unreadable/missing/permission-denied credentials file all mean the same thing to every caller ("not detected"), and the false answer FAILS CLOSED (the backend stays unregistered, nothing spawns). Ends if this probe ever gates something that opens rather than closes.
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** The raw inputs the OWNER-FALLBACK PEER-SET resolver reads (`fallback-peers.ts` holds the rule, the hazard
 *  and the standing warning). Same seam shape as `bindPostureInput`: this file stays the pure `process.env`
 *  reader; `entry/lifecycle` composes + logs, and `infra/auth/config` reads the same parse into `AuthConfig`. */
export function ownerFallbackPeerInput(): OwnerFallbackPeerInput {
  return { authFallback: env.AUTH_FALLBACK, trustedPeers: env.AUTH_FALLBACK_TRUSTED_PEERS };
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
