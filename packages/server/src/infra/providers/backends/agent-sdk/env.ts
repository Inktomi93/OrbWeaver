// THE CREDENTIAL FIREWALL. Three per-turn subprocess-env builders (mode-1 Max sub / mode-2 OpenRouter
// skin / mode-3 local vLLM). Ordering is the security: host baseline → runtime knobs → escape hatch
// (RESERVED_CLAUDE_ENV_KEYS filtered first) → auth firewall applied LAST so nothing above can override it.

import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { env, processEnvSnapshot } from "#foundation/env";
import type { OrSkinTierModels } from "../../contract";

// Non-Claude-namespaced app secrets the child has no business seeing (the Claude/Anthropic namespace is stripped wholesale below).
const HOST_SECRET_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "CREDENTIALS_KEY",
  "SESSION_SECRET",
  "OIDC_CLIENT_SECRET",
  "DEBUG_TOKEN",
  "LOCAL_INITIAL_PASSWORD",
] as const;

// The whole Claude/Anthropic namespace is stripped from the baseline so an ambient operator shell (e.g. a
// Claude Code session) can't leak entrypoint identity/tool surface/routing into the spawn; everything we
// need is re-added after the baseline.
const CLAUDE_ENV_PREFIXES = ["CLAUDE", "ANTHROPIC"] as const;
/** Extra ambient control knobs outside the CLAUDE/ANTHROPIC prefixes but still Claude behavior. */
const CLAUDE_ENV_EXACT_KEYS = new Set<string>(["MAX_THINKING_TOKENS"]);
function isAmbientClaudeEnvKey(key: string): boolean {
  return CLAUDE_ENV_PREFIXES.some((p) => key.startsWith(p)) || CLAUDE_ENV_EXACT_KEYS.has(key);
}

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

/** Per-turn knobs written into the agent-sdk subprocess env. Boolean fields opt OUT with `=== false`,
 *  distinguishing "unset" from "explicitly off". Knob names verified against the bundled claude runtime binary, not the JS wrapper. */
export interface ClaudeRuntimeOverrides {
  maxOutputTokens?: number | undefined;
  /** Soft cap on the runtime working set; the runtime transparently compacts/truncates to fit. */
  maxContextTokens?: number | undefined;
  /** Default OFF; set `false` to engage (then the typed thinking/effort SDK Options drive depth). */
  disableThinking?: boolean | undefined;
  disableAutoCompact?: boolean | undefined;
  /** When auto-compaction fires, as a percent of the window (0-100). Only meaningful in mode "auto". */
  autoCompactPct?: number | undefined;
  /** Power-user escape hatch; RESERVED_CLAUDE_ENV_KEYS are stripped before merge. */
  userEnv?: Record<string, string | null> | undefined;
}

// Deploy-only isolation pins, read by the BUNDLED claude runtime binary (not grep-able in the JS wrapper) —
// don't remove one because it "looks unused"; each was verified via DISCOVER=<filter> pnpm sdk:play.
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

// Keys a preset's escape hatch can never set or unset — auth, credential isolation, OR-skin routing.
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
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
]);

const DISABLE_CLAUDE_MDS = "true";
const OPENROUTER_ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
const LOOPBACK_HOST = "127.0.0.1";
const VLLM_PLACEHOLDER_TOKEN = "local-vllm";

// Every knob set EXPLICITLY (value or undefined), never inherited from the host shell, so a stray
// dev-session CLAUDE_EFFORT can't steer a turn.
function claudeRuntimeEnv(overrides: ClaudeRuntimeOverrides): Record<string, string | undefined> {
  return {
    CLAUDE_CODE_DISABLE_THINKING: overrides.disableThinking === false ? undefined : "1",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS:
      overrides.maxContextTokens !== undefined ? String(overrides.maxContextTokens) : undefined,
    CLAUDE_EFFORT: undefined,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS:
      overrides.maxOutputTokens !== undefined ? String(overrides.maxOutputTokens) : undefined,
    DISABLE_AUTO_COMPACT: overrides.disableAutoCompact === true ? "1" : undefined,
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:
      overrides.autoCompactPct !== undefined ? String(overrides.autoCompactPct) : undefined,
    ...ISOLATION_PINS,
  };
}

// Filters RESERVED_CLAUDE_ENV_KEYS first so a preset can never override auth/firewall/routing env; a reserved-key attempt drops silently.
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

// mode-1 ephemeral CLAUDE_CONFIG_DIR with ONLY .credentials.json symlinked in — the default ~/.claude
// also holds skills/memory/settings that leak into the spawned RP subprocess. Memoized one-per-process;
// falls back to the un-isolated default (still firewalled) if no host credentials exist.
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
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
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

// mode-2/3 ephemeral CLAUDE_CONFIG_DIR is EMPTY (no symlink) — the asymmetry with mode-1 IS the firewall.
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

export function buildClaudeSdkEnv(
  overrides: ClaudeRuntimeOverrides = {},
): Record<string, string | undefined> {
  const isoDir = mode1IsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    ...(isoDir !== undefined && { CLAUDE_CONFIG_DIR: isoDir, ANTHROPIC_CONFIG_DIR: isoDir }),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeEnv(overrides),
    ...claudeUserEnv(overrides.userEnv),
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_BASE_URL: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
  };
}

// mode-2: same agent-sdk runtime, env-swapped to route through OpenRouter's Anthropic-compatible skin.
// ANTHROPIC_API_KEY is set to an empty string (not unset — unset would let the runtime fall through to other sources).
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
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: OPENROUTER_ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: openRouterApiKey,
    ANTHROPIC_DEFAULT_OPUS_MODEL: tierModels.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: tierModels.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: tierModels.haiku,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
  };
}

// mode-3: agent-sdk runtime pointed at the local vLLM gen engine (loopback-only, so no SSRF/egress concern).
export function buildClaudeVllmEnv(
  overrides: ClaudeRuntimeOverrides = {},
): Record<string, string | undefined> {
  const configDir = emptyIsolatedConfigDir();
  const baseUrl = `http://${LOOPBACK_HOST}:${env.VLLM_GEN_PORT}`;
  // Claude Code can't resolve model ids containing "/" — the engine serves this slash-free alias via --served-model-name.
  const model = env.VLLM_GEN_MODEL.split("/").pop() ?? env.VLLM_GEN_MODEL;
  return {
    ...hostEnvForClaudeChild(),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeEnv(overrides),
    ...claudeUserEnv(overrides.userEnv),
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: VLLM_PLACEHOLDER_TOKEN,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
  };
}
