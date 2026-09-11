// THE CREDENTIAL FIREWALL. The per-turn subprocess-env builders: mode-1 Max sub + mode-2 OpenRouter skin
// (both LIVE) + mode-4 first-party Anthropic (buildClaudeAnthEnv, dormant W11 agent-principal path). mode-3
// local vLLM was RETIRED 2026-07-27 (owner ruling — see the note where buildClaudeVllmEnv was). Ordering is
// the security: host baseline → runtime knobs → escape hatch (ALLOWLISTED to the Claude runtime knob
// namespace, then RESERVED_CLAUDE_ENV_KEYS filtered) → auth firewall applied LAST so nothing above can
// override it. The knobs and the hatch merge in ONE place (`claudeRuntimeLayer`) because their COMBINATION is
// judged there — the runtime refuses a context cap with auto-compaction off (#1541). The hatch is spread OVER the host baseline, which is exactly why it may not name a host
// process variable: see `claudeUserEnv`.

import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ClaudeIsolationPinKey } from "@orb/contracts/preset";
import { HOST_OWNED_CLAUDE_ENV_KEYS, isAllowedClaudeRuntimeEnvKey } from "@orb/contracts/preset";
import { processEnvSnapshot } from "#foundation/env";
import type { OrSkinTierModels } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";

// Non-Claude-namespaced app secrets the child has no business seeing. These stay enumerated for the
// entrypoint parity test even though the ambient baseline below is now allowlisted, not copied then denied.
//
// COUPLED SITE — the container's `*_FILE` secret shim, `docker/entrypoint.sh`. That shim EXPORTS each of
// these into the server's process.env from a mounted file, and `processEnvSnapshot()` below is what this
// list then has to scrub; the child runs tools AS HOST, so a secret file-mountable there but missing here
// reaches a tool-executing subprocess. The two lists must stay SET-IDENTICAL — asserted (both directions,
// plus the strip itself) by tests/server/infra/providers/backends/agent-sdk/env.test.ts.
const HOST_SECRET_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "CREDENTIALS_KEY",
  "SESSION_SECRET",
  "OIDC_CLIENT_SECRET",
  "DEBUG_TOKEN",
  "LOCAL_INITIAL_PASSWORD",
] as const;

// The whole Claude/Anthropic namespace is excluded from the supported baseline so an ambient operator
// shell can't leak entrypoint identity/tool surface/routing into the spawn; runtime-owned values are added
// explicitly after the baseline.
const CLAUDE_ENV_PREFIXES = ["CLAUDE", "ANTHROPIC"] as const;
/** Extra ambient control knobs outside the CLAUDE/ANTHROPIC prefixes but still Claude behavior. */
const CLAUDE_ENV_EXACT_KEYS = new Set<string>(["MAX_THINKING_TOKENS"]);
function isAmbientClaudeEnvKey(key: string): boolean {
  return CLAUDE_ENV_PREFIXES.some((p) => key.startsWith(p)) || CLAUDE_ENV_EXACT_KEYS.has(key);
}

// Ambient process state is untrusted at the subprocess boundary. These are the host conveniences the
// bundled runtime actually needs; everything else (including NODE_OPTIONS, NODE_PATH, loader preloads and
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

function hostEnvForClaudeChild(): Record<string, string | undefined> {
  const source = processEnvSnapshot();
  const out: Record<string, string | undefined> = {};
  for (const key of SUPPORTED_HOST_ENV_KEYS) {
    if (!(HOST_SECRET_ENV_KEYS.includes(key) || isAmbientClaudeEnvKey(key))) {
      out[key] = source[key];
    }
  }
  return out;
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
  /** Power-user escape hatch for CLAUDE RUNTIME KNOBS only — allowlisted (`isAllowedClaudeRuntimeEnvKey`),
   *  then RESERVED_CLAUDE_ENV_KEYS stripped before merge. Never a way to set the child's process env. */
  userEnv?: Record<string, string | null> | undefined;
}

// Deploy-only isolation pins, read by the BUNDLED claude runtime binary (not grep-able in the JS wrapper) —
// don't remove one because it "looks unused"; each was verified via DISCOVER=<filter> pnpm sdk:play.
// KEYED BY THE CONTRACTS TUPLE (`ClaudeIsolationPinKey`) so the record and the name list that makes these
// preset-unsettable cannot drift: a pin added here without a row there is an excess-property tsc error, a
// name added there without a pin here is a missing-property one. The VALUES stay here — what a pin is set
// to is this deploy's decision; only the NAMES are shared vocabulary (#1536).
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
  // PREFIX-CACHE HYGIENE (vLLM Claude-Code-integration doc, 2026-07-27): Claude Code can inject a
  // per-request "attribution header" (a git-repo-context hash) into the system prompt, which CHURNS the
  // prompt every request and defeats Anthropic/OR prefix caching — quietly taxing every turn on the
  // surviving sub + OR skins (undermining the breakpoint/tail-placement/reseed-churn cache discipline).
  // `SIMPLE_SYSTEM_PROMPT=1` + `DISABLE_GIT_INSTRUCTIONS=1` (above) + the empty isolated config dir already
  // suppress it, but this pins it EXPLICITLY OFF so a future SDK bump can't re-enable a churning default.
  // Recognized env var in the bundled runtime (`CLAUDE_CODE_ATTRIBUTION_HEADER`, verified in sdk.mjs/bridge.mjs).
  CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
};

// Keys a preset's escape hatch can never set or unset — auth, credential isolation, OR-skin routing, AND
// every host-owned pin above (#1536: those are `CLAUDE_CODE_*`, i.e. inside the namespace the hatch admits,
// so the write schema's refusal needs this second belt behind it for an already-persisted row). The list is
// spread from the contracts vocabulary rather than re-spelled — one home, no drift.
export const RESERVED_CLAUDE_ENV_KEYS: ReadonlySet<string> = new Set<string>([
  ...HOST_OWNED_CLAUDE_ENV_KEYS,
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

/** The two runtime knobs whose COMBINATION the bundled runtime refuses — named once so the writer below and
 *  the guard cannot drift apart. Both spellings are the runtime's own (`DISABLE_AUTO_COMPACT` breaks the
 *  `CLAUDE_CODE_*` prefix on purpose; it is verified in the bundled binary, not the JS wrapper). */
const ENV_DISABLE_AUTO_COMPACT = "DISABLE_AUTO_COMPACT";
const ENV_MAX_CONTEXT_TOKENS = "CLAUDE_CODE_MAX_CONTEXT_TOKENS";

// Every knob set EXPLICITLY (value or undefined), never inherited from the host shell, so a stray
// dev-session CLAUDE_EFFORT can't steer a turn.
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

/**
 * THE RUNTIME-KNOB LAYER: the host's per-turn knobs with the preset's escape hatch spread over them — the ONE
 * place the final value of both is visible, and therefore the only place their COMBINATION can be judged.
 *
 * `CLAUDE_CODE_MAX_CONTEXT_TOKENS` together with `DISABLE_AUTO_COMPACT` is a hard SDK `is_error`
 * (live-verified both ways, 2026-07-24): with auto-compaction disabled the runtime has no mechanism left to
 * honour a context cap, so it fails the turn rather than ignoring one of them. `translate.ts` already refuses
 * to MINT the pair from the typed knobs (it drops the cap under managed compaction) — but the hatch writes
 * into this same env AFTERWARDS, so either half can still arrive from `advanced.claudeEnv` and produce a turn
 * that always errors. This repo refuses at the boundary instead of documenting a footgun (#1541).
 *
 * NOT THE WRITE SCHEMA'S JOB, and that is a placement fact rather than a preference: the schema validates the
 * hatch ALONE, so it cannot see the compaction mode that supplies the other half — a preset carrying only
 * `CLAUDE_CODE_MAX_CONTEXT_TOKENS` is perfectly legal under `compaction.mode:"auto"` and fatal under
 * `"managed"`. Only the builder sees both.
 *
 * The hatch may also CLEAR a knob (`null` ⇒ `undefined`), and that cures the pair — so the guard reads the
 * merged VALUES, never the caller's intent.
 */
function claudeRuntimeLayer(overrides: ClaudeRuntimeOverrides): Record<string, string | undefined> {
  const merged = { ...claudeRuntimeEnv(overrides), ...claudeUserEnv(overrides.userEnv) };
  if (merged[ENV_DISABLE_AUTO_COMPACT] !== undefined && merged[ENV_MAX_CONTEXT_TOKENS] !== undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message:
        `agent-sdk env: ${ENV_DISABLE_AUTO_COMPACT} and ${ENV_MAX_CONTEXT_TOKENS} cannot both be set — the runtime honours a ` +
        "context cap BY compacting, so with auto-compaction off it fails the turn instead. Set one: keep the cap and leave " +
        "compaction on (preset compaction mode `auto`), or disable compaction and drop the cap. Both halves can come from " +
        "the preset's `advanced.claudeEnv` hatch as well as from the compaction mode.",
    });
  }
  return merged;
}

// The overlay is RESERVED-filtered, then ALLOWLISTED (#1472, #1536). Both belts are load-bearing and the
// belt each key gets is DIFFERENT, so state it exactly: RESERVED_CLAUDE_ENV_KEYS drops SILENTLY the
// auth/config-dir/OR-routing keys AND the deploy's own isolation pins (the recorded behavior — a preset
// carrying a stale one is not a defect). The auth half is ALSO re-pinned last by every builder, so the drop
// is its second belt; the isolation pins are written BEFORE this overlay, so for them the drop is the ONLY
// thing standing between a preset and re-enabled auto-memory/cron/CLAUDE.md in the RP subprocess (the write
// schema refuses them at the boundary, which is the other half). Everything else must
// be a Claude RUNTIME KNOB (`@orb/contracts/preset`, the same predicate the write schema enforces) or it
// THROWS. That polarity is the point: this overlay is spread OVER the host baseline, so a settable `PATH`
// would have chosen which binary the child executes and a settable `HOME` where it reads its credentials —
// and no deny set stays ahead of the next such name. A loud refusal, because a preset asking for an
// out-of-namespace variable is a defect a silent drop would hide.
function claudeUserEnv(userOverrides: Record<string, string | null> | undefined): Record<string, string | undefined> {
  if (userOverrides === undefined) {
    return {};
  }
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(userOverrides)) {
    if (RESERVED_CLAUDE_ENV_KEYS.has(k)) {
      continue;
    }
    if (!isAllowedClaudeRuntimeEnvKey(k)) {
      throw new Error(`agent-sdk env: unsafe runtime environment key "${k}" is forbidden (only Claude runtime knobs may be set from a preset)`);
    }
    out[k] = v ?? undefined;
  }
  return out;
}

// mode-1 ephemeral CLAUDE_CONFIG_DIR with ONLY .credentials.json symlinked in — the default ~/.claude
// also holds skills/memory/settings that leak into the spawned (potentially adversarial) RP subprocess.
// TWO no-symlink outcomes, kept DISTINCT (owner ruling, #751 — FAIL CLOSED):
//   • host creds ABSENT   → nothing to isolate; degrade to the un-isolated default (still firewalled).
//   • host creds PRESENT but the symlink FAILED → isolation could NOT be established; REFUSE the spawn.
//     Silently degrading here would run the RP subprocess against the REAL ~/.claude — the leak. The
//     refusal is a ProviderError the caller (disciplineOptions / fetchAgentSdkModels) surfaces as a turn
//     error.
//
// ONLY SUCCESS IS MEMOIZED (#1406). The memo used to carry a third state — `null` for "checked, absent" —
// and because `null !== undefined` it LATCHED: credentials mounted or created after the first mode-1 build
// (a container secret landing late, an operator running `claude login` on a live box) were never seen
// again, and every later spawn ran against the host `~/.claude`. So absence is NOT a cached answer, it is
// simply "no dir yet": the probe re-runs on the next build. Same for the symlink refusal — a transient FS
// failure self-heals on the next turn, and every attempt stays fail-closed.
// The re-probe costs ONE `existsSync` per env build while unisolated, and only while unisolated. No TTL:
// this function runs immediately before forking the bundled Claude runtime, so a stat is noise beside the
// spawn it gates — and a TTL would re-introduce a window in which the isolation is known-stale on purpose.
let mode1IsolatedDir: string | undefined;
function mode1IsolatedConfigDir(): string | undefined {
  if (mode1IsolatedDir === undefined) {
    const credSrc = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credSrc)) {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "orbweaver-claude-sub-"));
    try {
      symlinkSync(credSrc, join(dir, ".credentials.json"));
    } catch (cause) {
      // @orb-waive caught-failure-ownership(catch): best-effort temp-dir cleanup on the symlink-failure path — the symlink already failed so `dir` holds no credential; a cleanup miss leaks only an empty tmp dir, never an auth decision. Ends if this cleanup becomes load-bearing or `dir` can ever hold a live credential.
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup of the temp dir; the isolation failure below is the fail-closed outcome.
      }
      // biome-ignore lint/style/useErrorCause: cause IS chained via the init object (`cause`) — the rule misses ProviderError's own cause-forwarding ctor.
      throw new ProviderError({
        kind: "forbidden",
        retryable: false,
        message:
          "agent-sdk: mode-1 isolation could not be established (host credentials present, isolated config-dir symlink failed); refusing to run un-isolated.",
        cause,
      });
    }
    mode1IsolatedDir = dir;
    // Closes over THIS dir rather than re-reading the memo: the handler is registered exactly once, on the
    // one build that establishes isolation, and it must remove the dir it created.
    process.on("exit", () => {
      rmSync(dir, { recursive: true, force: true });
    });
  }
  return mode1IsolatedDir;
}

// mode-2/4 ephemeral CLAUDE_CONFIG_DIR is EMPTY (no symlink) — the asymmetry with mode-1 IS the firewall.
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

export function buildClaudeSdkEnv(overrides: ClaudeRuntimeOverrides = {}): Record<string, string | undefined> {
  const isoDir = mode1IsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    ...(isoDir !== undefined && { CLAUDE_CONFIG_DIR: isoDir, ANTHROPIC_CONFIG_DIR: isoDir }),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeLayer(overrides),
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
    throw new Error("buildClaudeOpenRouterEnv: an OpenRouter API key is required for the Claude-API skin (mode-2).");
  }
  const configDir = emptyIsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeLayer(overrides),
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

// mode-4: first-party Anthropic direct — the bundled runtime's NATIVE `x-api-key` path (owner ruling:
// a user may run their AGENTS on their own paid Anthropic key). ANTHROPIC_API_KEY carries the real key;
// ANTHROPIC_BASE_URL is deliberately NOT set, so the runtime talks to api.anthropic.com directly (its
// default). Ambient-credential discipline: every OAuth/identity/
// service-account knob is pinned to `undefined` so no config-file/profile/OAuth resolution can fire, and the
// EMPTY isolated config dir (the mode-2/4 asymmetry) keeps the host `~/.claude` sub out of the spawn.
export function buildClaudeAnthEnv(anthropicApiKey: string, overrides: ClaudeRuntimeOverrides = {}): Record<string, string | undefined> {
  if (anthropicApiKey.length === 0) {
    throw new Error("buildClaudeAnthEnv: an Anthropic API key is required for the first-party agent path (mode-4).");
  }
  const configDir = emptyIsolatedConfigDir();
  return {
    ...hostEnvForClaudeChild(),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: DISABLE_CLAUDE_MDS,
    ...claudeRuntimeLayer(overrides),
    ANTHROPIC_API_KEY: anthropicApiKey,
    // ANTHROPIC_BASE_URL intentionally UNSET — the native default (api.anthropic.com). No Bearer/OAuth path.
    ANTHROPIC_AUTH_TOKEN: undefined,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN: undefined,
    ANTHROPIC_IDENTITY_TOKEN_FILE: undefined,
    ANTHROPIC_SERVICE_ACCOUNT_ID: undefined,
  };
}

// The mode-3 local vLLM loopback agent env (buildClaudeVllmEnv) was DELETED 2026-07-27 (owner ruling): the
// agent-sdk×vllm skin is retired — local vLLM chat runs on the chat-completions surface only (guided
// decoding + hermes parallel tools handle everything the SDK loopback did, without hanging the small model
// on structured schemas). `deriveRunner`/`disciplineOptions`/`assertCoherent` all reject agent-sdk×vllm now.
// If a future local Claude-runtime skin is ever wanted, re-add a builder here as a deliberate documented
// doorway — this is a retirement, not leftover wiring.
