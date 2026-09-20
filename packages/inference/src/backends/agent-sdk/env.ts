// THE CREDENTIAL FIREWALL — the per-turn subprocess-env builder for the `agent-sdk` wire (§8.4). ONE arm
// (2026-09-19, F17/F18 settled): the user's PASTED `claude setup-token` rides `CLAUDE_CODE_OAUTH_TOKEN`, the
// runtime's writable state lives in the user's OWN runtime dir (`CLAUDE_CONFIG_DIR`, `<USER_RUNTIME_DIR>/<owner>/
// claude`, never a process-wide dir and never `~/.claude`), and every other auth/identity knob is pinned
// `undefined` so no host login, profile or OAuth resolution can fire. The host-file arm, the OpenRouter skin
// (mode-2) and the first-party-key arm (mode-4) are DELETED with the fleet code — the subprocess is for the
// subscription only. Ordering is the security: host baseline → runtime knobs → escape hatch (ALLOWLISTED to
// the Claude runtime knob namespace, then RESERVED filtered) → the auth pins LAST so nothing above can override.

import type { ClaudeIsolationPinKey } from "@orb/contracts/preset";
import { HOST_OWNED_CLAUDE_ENV_KEYS, isAllowedClaudeRuntimeEnvKey } from "@orb/contracts/preset";
import { ProviderError } from "../../contract/errors.ts";

/** The documented headless subscription credential env (`claude setup-token`). */
export const CLAUDE_OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

// Non-Claude-namespaced app secrets the child has no business seeing — the deploy's `*_FILE` shim exports
// these into the server's env, so the allowlisted baseline below re-asserts the strip.
const HOST_SECRET_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "CREDENTIALS_KEY",
  "SESSION_SECRET",
  "OIDC_CLIENT_SECRET",
  "DEBUG_TOKEN",
  "LOCAL_INITIAL_PASSWORD",
] as const;

// The whole Claude/Anthropic namespace is excluded from the baseline so an ambient operator shell can't leak
// identity/tool surface/routing into the spawn; runtime-owned values are added explicitly after it.
const CLAUDE_ENV_PREFIXES = ["CLAUDE", "ANTHROPIC"] as const;
const CLAUDE_ENV_EXACT_KEYS = new Set<string>(["MAX_THINKING_TOKENS"]);
function isAmbientClaudeEnvKey(key: string): boolean {
  return CLAUDE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix)) || CLAUDE_ENV_EXACT_KEYS.has(key);
}

// The host conveniences the bundled runtime actually needs; everything else (NODE_OPTIONS, loader preloads,
// language search paths) stays out unless it is an explicitly supported runner-owned knob.
const SUPPORTED_HOST_ENV_KEYS = [
  "HOME",
  "PATH",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "COLORTERM",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
] as const;

function hostEnvForClaudeChild(source: Readonly<Record<string, string>>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of SUPPORTED_HOST_ENV_KEYS) {
    if (!(HOST_SECRET_ENV_KEYS.includes(key) || isAmbientClaudeEnvKey(key))) {
      out[key] = source[key];
    }
  }
  return out;
}

/** Per-turn knobs written into the subprocess env. Boolean fields opt OUT with `=== false`, distinguishing
 *  "unset" from "explicitly off". Knob names verified against the bundled claude runtime binary. */
export interface ClaudeRuntimeOverrides {
  maxOutputTokens?: number | undefined;
  /** Soft cap on the runtime working set; the runtime transparently compacts/truncates to fit. */
  maxContextTokens?: number | undefined;
  /** Default OFF; set `false` to engage (then the typed thinking/effort SDK Options drive depth). */
  disableThinking?: boolean | undefined;
  disableAutoCompact?: boolean | undefined;
  /** When auto-compaction fires, as a percent of the window (0-100). Only meaningful in mode "auto". */
  autoCompactPct?: number | undefined;
  /** Power-user escape hatch for CLAUDE RUNTIME KNOBS only — allowlisted, then RESERVED stripped. */
  userEnv?: Record<string, string | null> | undefined;
}

// Deploy-only isolation pins, read by the BUNDLED runtime binary — keyed by the contracts tuple so a pin here
// and a preset-unsettable name there cannot drift (#1536).
const ISOLATION_PINS: Readonly<Record<ClaudeIsolationPinKey, string>> = {
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
  // PREFIX-CACHE HYGIENE: the per-request attribution header churns the system prompt and defeats caching.
  CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
};

/** Keys a preset's escape hatch can never set or unset — auth, credential isolation, config dir, AND every
 *  host-owned pin above. Spread from the contracts vocabulary rather than re-spelled — one home, no drift. */
export const RESERVED_CLAUDE_ENV_KEYS: ReadonlySet<string> = new Set<string>([
  ...HOST_OWNED_CLAUDE_ENV_KEYS,
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  CLAUDE_OAUTH_TOKEN_ENV,
  "ANTHROPIC_IDENTITY_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN_FILE",
  "ANTHROPIC_SERVICE_ACCOUNT_ID",
  "CLAUDE_CONFIG_DIR",
  "ANTHROPIC_CONFIG_DIR",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
]);

const DISABLE_CLAUDE_MDS = "true";
/** The two runtime knobs whose COMBINATION the bundled runtime refuses (#1541). */
const ENV_DISABLE_AUTO_COMPACT = "DISABLE_AUTO_COMPACT";
const ENV_MAX_CONTEXT_TOKENS = "CLAUDE_CODE_MAX_CONTEXT_TOKENS";

// Every knob set EXPLICITLY (value or undefined), never inherited from the host shell.
function claudeRuntimeEnv(overrides: ClaudeRuntimeOverrides): Record<string, string | undefined> {
  return {
    CLAUDE_CODE_DISABLE_THINKING: overrides.disableThinking === false ? undefined : "1",
    [ENV_MAX_CONTEXT_TOKENS]: overrides.maxContextTokens !== undefined ? String(overrides.maxContextTokens) : undefined,
    CLAUDE_EFFORT: undefined,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: overrides.maxOutputTokens !== undefined ? String(overrides.maxOutputTokens) : undefined,
    [ENV_DISABLE_AUTO_COMPACT]: overrides.disableAutoCompact === true ? "1" : undefined,
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: overrides.autoCompactPct !== undefined ? String(overrides.autoCompactPct) : undefined,
    ...ISOLATION_PINS,
  };
}

// The hatch is RESERVED-filtered (silently — a stale pin in a preset is not a defect) then ALLOWLISTED
// (loudly — an out-of-namespace variable would choose the child's binary or credential file).
function claudeUserEnv(userOverrides: Record<string, string | null> | undefined): Record<string, string | undefined> {
  if (userOverrides === undefined) {
    return {};
  }
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(userOverrides)) {
    if (RESERVED_CLAUDE_ENV_KEYS.has(key)) {
      continue;
    }
    if (!isAllowedClaudeRuntimeEnvKey(key)) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `agent-sdk env: unsafe runtime environment key "${key}" is forbidden (only Claude runtime knobs may be set from a preset)`,
      });
    }
    out[key] = value ?? undefined;
  }
  return out;
}

/** The runtime-knob layer — the ONE place both the host's knobs and the hatch are visible, so the refused
 *  COMBINATION (a context cap with auto-compaction off) is judged on the merged VALUES (#1541). */
function claudeRuntimeLayer(overrides: ClaudeRuntimeOverrides): Record<string, string | undefined> {
  const merged = { ...claudeRuntimeEnv(overrides), ...claudeUserEnv(overrides.userEnv) };
  if (merged[ENV_DISABLE_AUTO_COMPACT] !== undefined && merged[ENV_MAX_CONTEXT_TOKENS] !== undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message:
        `agent-sdk env: ${ENV_DISABLE_AUTO_COMPACT} and ${ENV_MAX_CONTEXT_TOKENS} cannot both be set — the runtime honours a ` +
        "context cap BY compacting, so with auto-compaction off it fails the turn instead. Set one: keep the cap and leave " +
        "compaction on (preset compaction mode `auto`), or disable compaction and drop the cap.",
    });
  }
  return merged;
}

export interface ClaudeSdkEnvArgs {
  /** The child-env allowlist source (`deps.env.hostEnvAllowlist()`), narrowed here to the supported keys. */
  readonly hostEnv: Readonly<Record<string, string>>;
  /** The user's pasted `claude setup-token` — the connection's resolved secret. */
  readonly token: string;
  /** `<USER_RUNTIME_DIR>/<ownerId>/claude` — the runtime's writable state, per user. */
  readonly configDir: string;
  readonly overrides?: ClaudeRuntimeOverrides | undefined;
}

/** The subscription spawn env: the allowlisted host baseline, the per-user config dir, the runtime knobs +
 *  hatch, and the auth pins written LAST. */
export function buildClaudeSdkEnv(args: ClaudeSdkEnvArgs): Record<string, string | undefined> {
  if (args.token.length === 0) {
    throw new ProviderError({
      kind: "auth_failed",
      retryable: false,
      message: "agent-sdk: the connection carries no subscription token (paste one from `claude setup-token`)",
    });
  }
  return {
    ...hostEnvForClaudeChild(args.hostEnv),
    CLAUDE_CONFIG_DIR: args.configDir,
    ANTHROPIC_CONFIG_DIR: args.configDir,
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeLayer(args.overrides ?? {}),
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_BASE_URL: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
    [CLAUDE_OAUTH_TOKEN_ENV]: args.token,
  };
}
