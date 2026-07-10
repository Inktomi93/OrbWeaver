// infra/providers/backends/agent-sdk/env — THE CREDENTIAL FIREWALL (security-load-bearing, ledger D8).
// Three per-turn subprocess-env builders (mode-1 Max sub / mode-2 OpenRouter-Anthropic skin / mode-3
// local vLLM), the `RESERVED_CLAUDE_ENV_KEYS` denylist, and the ephemeral `CLAUDE_CONFIG_DIR`
// symlink-isolation. Rebuilt EVERY turn — runner machinery, not boot config (providers.md Esoteric §1).
//
// THE ORDERING IS THE SECURITY (do NOT reorder):
//   1. host baseline  — `hostEnvForClaudeChild()` (the raw process.env snapshot from foundation/env
//                        MINUS the app's own secrets) + the per-mode CLAUDE_CONFIG_DIR isolation.
//   2. runtime knobs  — `claudeRuntimeEnv(overrides)` (the per-preset generation knobs + the deploy-only
//                        isolation pins; every knob set EXPLICITLY so no ambient host export leaks in).
//   3. escape hatch   — `claudeUserEnv(overrides.userEnv)`, with RESERVED_CLAUDE_ENV_KEYS FILTERED OUT
//                        FIRST so a preset can neither set auth/routing env nor strip the firewall.
//   4. AUTH FIREWALL  — applied LAST so step 3 can never override it. mode-1 nulls the OR-skin trio;
//                        mode-2/3 use an EMPTY ephemeral config dir + a paid/loopback base URL + null
//                        every host credential source — so the sub OAuth token is STRUCTURALLY
//                        unreachable from a paid/local spawn regardless of the runtime's precedence.
// Reorder 3 before the reserved-filter, or 4 before 3, and the sub token can leak to a paid endpoint.
//
// We NEVER read, parse, or transmit the host `claude login` OAuth token (`.credentials.json`). mode-1
// SYMLINKS that file into an ephemeral dir; the bundled runtime reads the symlink and makes the same
// Anthropic call. That is filesystem aliasing, NOT credential extraction — the st-claude-proxy ban
// shape (token → our HTTP client → a paid endpoint) is exactly what we do not do.

import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { env, processEnvSnapshot } from "#foundation/env";
import type { OrSkinTierModels } from "../../contract";

// ── Host-secret denylist (the app's OWN secrets the Claude child has no business seeing) ──────────────
// The firewall owns this policy (foundation/env produces only the raw snapshot, ledger §2 / D8). These
// are the NON-Claude-namespaced app secrets (the Claude/Anthropic namespace is stripped wholesale below,
// so it need not be listed here). This does NOT overlap the credential firewall: the ANTHROPIC_* /
// CLAUDE_CODE_OAUTH_TOKEN sources are set/nulled by each builder AFTER this baseline.
const HOST_SECRET_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "CREDENTIALS_KEY",
  "SESSION_SECRET",
  "OIDC_CLIENT_SECRET",
  "DEBUG_TOKEN",
  "LOCAL_INITIAL_PASSWORD",
] as const;

// ── Ambient Claude/Anthropic control-surface strip (uncontrolled-behavior leak guard) ─────────────────
// The spawned RP/chat subprocess's Claude behavior must be 100% OUR config, not the operator's ambient
// shell. When the app runs from a shell that exports CLAUDE_CODE_* / CLAUDECODE / ANTHROPIC_* (e.g. the
// operator's own Claude Code session, or a deploy shell), those vars would pass through the baseline and
// silently flip entrypoint identity, tool surface, model routing, thinking budget, etc. So we strip the
// ENTIRE Claude/Anthropic namespace from the baseline. This is SAFE: everything we actually depend on is
// re-added AFTER the baseline in the spread order (claudeRuntimeEnv's ISOLATION_PINS + generation knobs,
// then each builder's auth-firewall overlay), so nothing we need can be stripped here — only leaks.
// Deploy-time CLAUDE_CODE_* knobs flow ONLY through the per-preset escape hatch (`advanced.claudeEnv` via
// {@link claudeUserEnv}, still filtered by {@link RESERVED_CLAUDE_ENV_KEYS}), NOT ambient shell passthrough.
const CLAUDE_ENV_PREFIXES = ["CLAUDE", "ANTHROPIC"] as const;
/** Extra ambient control knobs outside the CLAUDE/ANTHROPIC prefixes but still Claude behavior. */
const CLAUDE_ENV_EXACT_KEYS = new Set<string>(["MAX_THINKING_TOKENS"]);
function isAmbientClaudeEnvKey(key: string): boolean {
  return CLAUDE_ENV_PREFIXES.some((p) => key.startsWith(p)) || CLAUDE_ENV_EXACT_KEYS.has(key);
}

/** `process.env` (via the foundation snapshot) minus the app's own secrets AND the entire ambient
 *  Claude/Anthropic control surface — the baseline all three SDK child envs spread. Non-Claude vars
 *  (PATH/HOME/LANG/TMPDIR/…) survive; the child needs them to spawn. The SOLE place that consumes the
 *  raw snapshot for the Claude child. */
function hostEnvForClaudeChild(): Record<string, string | undefined> {
  const base = processEnvSnapshot();
  for (const key of HOST_SECRET_ENV_KEYS) {
    delete base[key];
  }
  for (const key of Object.keys(base)) {
    if (isAmbientClaudeEnvKey(key)) {
      delete base[key];
    }
  }
  return base;
}

/**
 * Per-turn knobs the env builder writes into the agent-sdk subprocess env — the env shape, not the
 * preset shape (`translate.ts` projects `UserIntent` × `ModelCapability` into this). Every field is
 * OPTIONAL; defaults land in {@link claudeRuntimeEnv} (isolation pins ON; boolean fields opt OUT with
 * `=== false`, distinguishing "unset" from "explicitly off"). Knob names were verified against the
 * BUNDLED claude runtime binary (`DISCOVER=… sdk:play`), NOT the JS wrapper — see {@link ISOLATION_PINS}.
 */
export interface ClaudeRuntimeOverrides {
  /** Reply ceiling → CLAUDE_CODE_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number | undefined;
  /** Soft cap on the total runtime working set → CLAUDE_CODE_MAX_CONTEXT_TOKENS (the runtime
   *  transparently compacts/truncates to fit). undefined ⇒ SDK default. */
  maxContextTokens?: number | undefined;
  /** Thinking. Default OFF (CLAUDE_CODE_DISABLE_THINKING="1"). Set `false` to engage it (then the typed
   *  `thinking`/`effort` SDK Options drive depth). undefined ⇒ default off. */
  disableThinking?: boolean | undefined;
  /** Auto-compaction off (DISABLE_AUTO_COMPACT="1") — set for compaction mode "off"/"managed".
   *  undefined ⇒ auto-compaction ON. */
  disableAutoCompact?: boolean | undefined;
  /** WHEN auto-compaction fires, as a PERCENT of the window (0–100). Only meaningful in mode "auto". */
  autoCompactPct?: number | undefined;
  /** Power-user escape hatch (UserIntent.advanced.claudeEnv). RESERVED_CLAUDE_ENV_KEYS are stripped
   *  before merge — `null` ⇒ unset, `string` ⇒ set. */
  userEnv?: Record<string, string | null> | undefined;
}

// ── (c) Deploy-only isolation pins — the named backend config, never per-preset ──────────────────────
// ⚠️ DO NOT remove a name because it "looks unused": these are read by the BUNDLED claude runtime
// binary the SDK spawns, NOT the JS wrapper, so they are not grep-able in `sdk.mjs`. Each was verified
// empirically (`DISCOVER=<filter> pnpm sdk:play`, which strings-scans the real binary). Measured
// savings (neo 2026-06-03, host Max sub, Haiku 4.5): DISABLE_AUTO_MEMORY fixes the `memory_paths.auto`
// leak + kills claude.ai MCP enumeration (~311→155 preamble tokens); SIMPLE_SYSTEM_PROMPT swaps the
// full Claude Code preamble for the minimal scaffold (we ship our own RP prompt); DISABLE_1M_CONTEXT —
// Opus 1M costs more on the OR-skin path, we always cap at 200k; the tooling-disable knobs strip init
// enumeration RP never uses. NOT set (deliberately): CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC — staying
// above-board with Anthropic's abuse-detection channel.
const ISOLATION_PINS: Readonly<Record<string, string>> = {
  CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: "1",
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  CLAUDE_CODE_DISABLE_CRON: "1",
  CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: "1",
  CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: "1",
  CLAUDE_CODE_DISABLE_ATTACHMENTS: "1",
  CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1",
  CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: "1",
  CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
};

/**
 * Keys a preset's `advanced.claudeEnv` escape hatch can NEVER set or unset — they control auth,
 * credential isolation, and OR-skin model routing. A malicious preset must not repoint a mode-2 spawn at
 * a third-party endpoint (the st-claude-proxy ban shape) or strip the firewall. Filtered in
 * {@link claudeUserEnv} BEFORE the auth overlay. (security-load-bearing; the firewall test asserts it.)
 */
export const RESERVED_CLAUDE_ENV_KEYS: ReadonlySet<string> = new Set<string>([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN_FILE",
  "ANTHROPIC_SERVICE_ACCOUNT_ID",
  "CLAUDE_CONFIG_DIR",
  "ANTHROPIC_CONFIG_DIR",
  // Model routing tier defaults (OR-skin path) — set by the env builder from the resolved routing
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
]);

/** CLAUDE.md injection kill-switch — pinned on every spawn (the host's CLAUDE.md must not steer RP). */
const DISABLE_CLAUDE_MDS = "true";
/** The OR skin's auth target (the Anthropic-compatible skin lives under `/api`). */
const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
const LOOPBACK_HOST = "127.0.0.1";
/** Placeholder token for the keyless loopback vLLM engine (it ignores auth). */
const VLLM_PLACEHOLDER_TOKEN = "local-vllm";

/**
 * Typed-knob → env mapping: per-preset generation knobs (nature d) merged with the deploy-only
 * isolation pins (nature c). Shared by all three paths so they stay byte-comparable for caching. Every
 * knob is set EXPLICITLY (value or `undefined`) — never inherited from the host shell — so a stray
 * dev-session `CLAUDE_EFFORT` can't steer a turn.
 */
function claudeRuntimeEnv(overrides: ClaudeRuntimeOverrides): Record<string, string | undefined> {
  return {
    // ── (d) Generation knobs (per-preset overridable) ──
    CLAUDE_CODE_DISABLE_THINKING: overrides.disableThinking === false ? undefined : "1",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS:
      overrides.maxContextTokens !== undefined ? String(overrides.maxContextTokens) : undefined,
    // Ambient host-shell leak guard — every EXPLICITLY-set knob shares this discipline.
    CLAUDE_EFFORT: undefined,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS:
      overrides.maxOutputTokens !== undefined ? String(overrides.maxOutputTokens) : undefined,
    DISABLE_AUTO_COMPACT: overrides.disableAutoCompact === true ? "1" : undefined,
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:
      overrides.autoCompactPct !== undefined ? String(overrides.autoCompactPct) : undefined,
    // ── (c) Deploy-only isolation pins ──
    ...ISOLATION_PINS,
  };
}

/**
 * Escape hatch: maps a preset's `advanced.claudeEnv` (string → set, null → unset) into the spawn env,
 * FILTERING {@link RESERVED_CLAUDE_ENV_KEYS} first so a preset can never override auth/firewall/routing
 * env. A reserved-key attempt is dropped SILENTLY (a security floor, not a UX surface).
 */
function claudeUserEnv(
  userOverrides: Record<string, string | null> | undefined,
): Record<string, string | undefined> {
  if (userOverrides === undefined) {
    return {};
  }
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(userOverrides)) {
    if (RESERVED_CLAUDE_ENV_KEYS.has(k)) {
      continue;
    }
    out[k] = v ?? undefined;
  }
  return out;
}

// ── mode-1 (Max sub) ephemeral CLAUDE_CONFIG_DIR — ONLY `.credentials.json` symlinked in ──────────────
// The bundled runtime reads its config from CLAUDE_CONFIG_DIR (`~/.claude` by default), which also holds
// skills/, projects/…/memory/, settings.json — host state measured to leak MCPs + auto-memory paths
// into the spawned RP subprocess. Fix: an ephemeral dir with ONLY `.credentials.json` SYMLINKED in.
// Memoized one-per-process; falls back to the un-isolated default if no host credentials exist (dev/CI
// without `claude login`) — that fallback still hits the mode-1 auth firewall (the OR trio is nulled).
let mode1IsolatedDir: string | undefined | null;
function mode1IsolatedConfigDir(): string | undefined {
  if (mode1IsolatedDir === undefined) {
    const credSrc = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credSrc)) {
      mode1IsolatedDir = null;
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "orbweaver-claude-sub-"));
    try {
      symlinkSync(credSrc, join(dir, ".credentials.json"));
    } catch {
      // Read-only fs etc. — clean up and bail to the un-isolated default (still firewalled).
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup; nothing actionable on a double failure.
      }
      mode1IsolatedDir = null;
      return;
    }
    mode1IsolatedDir = dir;
    process.on("exit", () => {
      if (mode1IsolatedDir !== undefined && mode1IsolatedDir !== null) {
        rmSync(mode1IsolatedDir, { recursive: true, force: true });
      }
    });
  }
  return mode1IsolatedDir ?? undefined;
}

// ── mode-2/3 ephemeral CLAUDE_CONFIG_DIR — EMPTY ──────────────────────────────────────────────────────
// A paid/loopback spawn sets a non-host base URL, so the host `.credentials.json` MUST NOT be reachable.
// The dir is EMPTY (no symlink) — the asymmetry with mode-1 IS the firewall. Memoized one-per-process.
let mode2IsolatedDir: string | undefined;
function emptyIsolatedConfigDir(): string {
  if (mode2IsolatedDir === undefined) {
    mode2IsolatedDir = mkdtempSync(join(tmpdir(), "orbweaver-claude-or-"));
    process.on("exit", () => {
      if (mode2IsolatedDir !== undefined) {
        rmSync(mode2IsolatedDir, { recursive: true, force: true });
      }
    });
  }
  return mode2IsolatedDir;
}

/**
 * mode-1 — the Max sub (host `claude login`). Symlinks ONLY `.credentials.json` into an ephemeral
 * config dir and NULLS the OR-skin trio so a stale ambient export can't repoint this free sub spawn at a
 * paid base URL with an alien token. Auth firewall applied LAST (after the escape hatch).
 */
export function buildClaudeSdkEnv(
  overrides: ClaudeRuntimeOverrides = {},
): Record<string, string | undefined> {
  const isoDir = mode1IsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    // undefined (no host credentials) ⇒ skip; the runtime falls back to ~/.claude (still firewalled).
    ...(isoDir !== undefined && { CLAUDE_CONFIG_DIR: isoDir, ANTHROPIC_CONFIG_DIR: isoDir }),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeEnv(overrides),
    ...claudeUserEnv(overrides.userEnv),
    // Auth firewall — runner-owned, applied AFTER the escape hatch so a preset can never strip it.
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_BASE_URL: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
  };
}

/**
 * mode-2 — the OR-Anthropic skin: the SAME agent-sdk runtime, env-swapped to route through OpenRouter's
 * Anthropic-compatible skin (paid Claude reusing the whole sdk-mode pipeline). The spawn sets a paid
 * base URL, so the host sub token MUST be unreachable: an EMPTY ephemeral config dir + EVERY host
 * credential source nulled. The ONLY auth in scope is the OpenRouter key (passed as an arg — pure +
 * the "key required" invariant explicit at the call site). `ANTHROPIC_API_KEY` is set to EMPTY STRING
 * (not unset — an unset key lets the runtime fall through to other sources).
 *
 * `tierModels` is REQUIRED (no default): the OR-skin tier → OpenRouter slug map is now DERIVED by the
 * connection domain from its two live catalogs (`deriveOrSkinTierModels`) and threaded down on the request,
 * so the firewall holds ZERO hardcoded model strings. It still lands in the auth-firewall overlay position
 * (after the escape hatch), and its three keys stay in {@link RESERVED_CLAUDE_ENV_KEYS} — a preset can
 * neither set nor strip them. The derivation never throws (a cold catalog degrades to the curated
 * shortlist), so a caller always has a coherent trio to pass.
 */
export function buildClaudeOpenRouterEnv(
  openRouterApiKey: string,
  tierModels: OrSkinTierModels,
  overrides: ClaudeRuntimeOverrides = {},
): Record<string, string | undefined> {
  if (openRouterApiKey.length === 0) {
    throw new Error(
      "buildClaudeOpenRouterEnv: an OpenRouter API key is required for the Claude-API skin (mode-2).",
    );
  }
  const configDir = emptyIsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeEnv(overrides),
    ...claudeUserEnv(overrides.userEnv),
    // Auth firewall — applied LAST so a preset's escape hatch can never override these.
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: OPENROUTER_ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: openRouterApiKey,
    ANTHROPIC_DEFAULT_OPUS_MODEL: tierModels.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: tierModels.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: tierModels.haiku,
    // Credential isolation — empty ephemeral dir + null every alternative host credential source. The
    // sub OAuth token is structurally unreachable regardless of the runtime's credential precedence.
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
  };
}

/**
 * mode-3 — the agent-sdk runtime pointed at the local vLLM gen engine (the keyless local agent path,
 * for a non-owner buddy turn — `max-pro-sub` is owner-gated upstream). vLLM serves the Anthropic
 * Messages API on loopback; same firewall as mode-2 (empty config dir + every host credential nulled),
 * only the base URL is the loopback engine and auth is a throwaway. Loopback-only ⇒ no SSRF/egress
 * concern. All tier requests map to the single served model (one local model).
 */
export function buildClaudeVllmEnv(
  overrides: ClaudeRuntimeOverrides = {},
): Record<string, string | undefined> {
  const configDir = emptyIsolatedConfigDir();
  const baseUrl = `http://${LOOPBACK_HOST}:${env.VLLM_GEN_PORT}`;
  // Slash-free leaf alias — Claude Code can't resolve model ids containing "/" (the engine serves this
  // alias via --served-model-name).
  const model = env.VLLM_GEN_MODEL.split("/").pop() ?? env.VLLM_GEN_MODEL;
  return {
    ...hostEnvForClaudeChild(),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeEnv(overrides),
    ...claudeUserEnv(overrides.userEnv),
    // Auth firewall — runner-owned, applied LAST. vLLM is keyless; the token is a placeholder.
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: VLLM_PLACEHOLDER_TOKEN,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    // Credential isolation — same as mode-2: empty dir + null every host credential source.
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
  };
}
