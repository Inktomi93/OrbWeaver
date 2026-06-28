// infra/providers/backends/agent-sdk/translate — the request→SDK-options builder. THREE jobs:
//   • disciplineOptions — THE FIREWALL BASE: `tools:[]` (no built-in tools) + the cowork denylist +
//     `strictMcpConfig` + empty `settingSources` + the per-credential env (env.ts). This is the shape
//     both the roleplay runner and the agent runner start from; the asymmetry the agent runner adds
//     (an MCP server + maxTurns) is the only difference.
//   • buildSystemPrompt — join our static/dynamic halves into the one string the SDK sends.
//   • toSdkGeneration — call the ONE funnel (`infra/providers/resolve-chat.ts`) that owns intent→knob
//     POLICY, then MAP its resolved decision into the SDK's two output surfaces: the typed generation
//     Options (thinking/effort/maxBudgetUsd) + the env overrides (output/context caps, compaction, the
//     escape hatch). ALL the gating/clamp/guard logic now lives in resolve-chat (invariant #9); this file
//     keeps only the SDK-vocab SHAPE mapping (`toSdkEffort`, the `ThinkingConfig` build).

import type { EffortLevel, ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract";
import { ProviderError } from "../../contract";
import { resolveChat } from "../../resolve-chat";
import type { ClaudeRuntimeOverrides } from "./env";
import { buildClaudeOpenRouterEnv, buildClaudeSdkEnv, buildClaudeVllmEnv } from "./env";
import type { DisciplineOptions } from "./types";

// The cowork bundle `tools:[]` does NOT remove (it is neither a built-in, nor MCP, nor settings-driven).
// Measured live: these four leak into every spawn regardless of env knobs / settingSources / the isolated
// config dir; the model emitting one needs a 2nd turn (maxTurns is 1) → the `error_max_turns(1)` failures.
// `disallowedTools` strips them from the model's context entirely. Add to this list if the bundle grows.
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"] as const;
/** A percent is 0–100; the SDK auto-compact override is an integer percent of the window. */
const PCT_SCALE = 100;

/**
 * Build the FIREWALL BASE Options for a turn: the leak-proof discipline (no built-in tools, the cowork
 * denylist, strict MCP, no settings) + the per-credential subprocess env. Dispatches the env builder on
 * `credential.source`: `max-pro-sub` → the sub (mode-1), `openrouter` → the OR-Anthropic skin (mode-2),
 * `vllm` → the loopback local engine (mode-3). `local-light`/`custom_openai` never reach the agent-sdk
 * backend (the role firewall + the runner-derivation reject them upstream); a typed throw is the backstop.
 */
export function disciplineOptions(
  credential: ResolvedCredential,
  overrides: ClaudeRuntimeOverrides = {},
): DisciplineOptions {
  const base = {
    disallowedTools: [...COWORK_DENYLIST],
    tools: [] as string[],
    mcpServers: {} as Record<string, never>,
    strictMcpConfig: true as const,
    settingSources: [] as never[],
  };
  switch (credential.source) {
    case "max-pro-sub":
      return { ...base, env: buildClaudeSdkEnv(overrides) };
    case "openrouter":
      return { ...base, env: buildClaudeOpenRouterEnv(credential.apiKey, overrides) };
    case "vllm":
      return { ...base, env: buildClaudeVllmEnv(overrides) };
    default:
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `agent-sdk: unsupported credential source "${credential.source}" (sub/openrouter/vllm only)`,
      });
  }
}

/**
 * Opt-in subprocess observability. At LOG_LEVEL debug/trace, enable the SDK's `--debug` instrumentation
 * (it proves plugin/hook injection is 0/0 with our config) and pipe the raw subprocess stderr into the
 * logger. METADATA only (endpoints/request-ids) — never the assembled prompt or reply. Kept OUT of
 * `disciplineOptions` so that helper stays the pure leak contract the tests lock.
 */
export function observabilityOptions(): { debug?: boolean; stderr?: (data: string) => void } {
  if (env.LOG_LEVEL !== "debug" && env.LOG_LEVEL !== "trace") {
    return {};
  }
  return {
    debug: true,
    stderr: (data: string): void => {
      getLog().debug({ sdk: "stderr" }, data.trimEnd());
    },
  };
}

/**
 * Join the assembled static/dynamic system-prompt halves into the ONE string the SDK sends. We do NOT
 * emit the SDK's `[static, BOUNDARY, dynamic]` array form: at the pinned SDK the boundary sentinel is NOT
 * stripped and LEAKS into context whenever a dynamic half exists (verified live in neo). The SDK still
 * caches the system prompt internally; we trade the explicit static-prefix split for a leak-free prompt.
 * Returns undefined when there is nothing to send (the SDK then uses its own default).
 */
export function buildSystemPrompt(
  sp: { static: string; dynamic: string } | undefined,
): string | undefined {
  if (sp === undefined) {
    return;
  }
  const staticPart = sp.static.trim();
  const dynamicPart = sp.dynamic.trim();
  if (staticPart.length === 0 && dynamicPart.length === 0) {
    return;
  }
  if (staticPart.length === 0) {
    return dynamicPart;
  }
  if (dynamicPart.length === 0) {
    return staticPart;
  }
  return `${staticPart}\n\n${dynamicPart}`;
}

/** The SDK generation knobs this projection emits — typed against the SDK so a mismatch is a `tsc` error
 *  (`fastMode` is intentionally absent: it is not an `Options` field at the pinned SDK 0.3.195). */
interface SdkGenerationOptions {
  thinking?: ThinkingConfig;
  effort?: EffortLevel;
  maxBudgetUsd?: number;
}

/** Map the user-intent effort vocab (which carries `none`/`minimal`) onto the SDK's `EffortLevel`
 *  (`low..max`). `none` means thinking-off (handled by the caller); `minimal` aliases to `low`. */
function toSdkEffort(effort: UserIntent["effort"]): EffortLevel | undefined {
  switch (effort) {
    case undefined:
    case "none":
      return;
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "max";
    default:
      return;
  }
}

/** Map the capability-RESOLVED reasoning decision → the SDK `ThinkingConfig`. The policy (the
 *  effort-levels clamp, the display gate, and the Opus-4.8 adaptive/budget guard — providers.md Esoteric
 *  §8) already ran in `resolve-chat`; this is a pure SDK-shape map. The `adaptive` arm NEVER carries a
 *  budget (resolve-chat dropped it), so Opus-4.8-class models that 400 on `enabled + budget_tokens` get a
 *  clean `adaptive`. */
function buildThinking(reasoning: ResolvedReasoning): ThinkingConfig {
  const displayPart = reasoning.display !== undefined ? { display: reasoning.display } : {};
  // if-blocks (not a `switch`) on the resolved mode: biome's `noUnnecessaryConditions` under-resolves the
  // cross-package `z.infer` `ReasoningMode` union on a switch discriminant and false-flags the
  // adaptive/budget cases as unreachable — tsc sees all four members (verified via a type probe).
  const { mode } = reasoning;
  if (mode === "adaptive") {
    return { type: "adaptive", ...displayPart };
  }
  if (mode === "budget") {
    return {
      type: "enabled",
      ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}),
      ...displayPart,
    };
  }
  // "effort" (and the defensive "none"-but-enabled case): plain enabled; the effort level rides on the
  // top-level `options.effort` (set by `buildGenerationOptions`).
  return { type: "enabled", ...displayPart };
}

/** The typed SDK generation Options half of the projection (thinking + effort + budget). Consumes the
 *  resolved decision: thinking engages exactly when `resolved.reasoning.enabled`; the effort level (only
 *  populated by resolve-chat for effort/adaptive modes, already clamped) is mapped to SDK vocab. */
function buildGenerationOptions(
  params: UserIntent,
  resolved: ResolvedChatKnobs,
): SdkGenerationOptions {
  const options: SdkGenerationOptions = {};
  const { reasoning } = resolved;
  if (reasoning.enabled) {
    options.thinking = buildThinking(reasoning);
    const effort = toSdkEffort(reasoning.effort);
    if (effort !== undefined) {
      options.effort = effort;
    }
  } else {
    options.thinking = { type: "disabled" };
  }
  if (params.maxBudgetUsd !== undefined) {
    options.maxBudgetUsd = params.maxBudgetUsd;
  }
  return options;
}

/** The env-overrides half of the projection (output/context caps, compaction, the escape hatch). The
 *  output cap is the resolve-chat-clamped value; `disableThinking` mirrors the resolved on/off. */
function buildEnvOverrides(
  params: UserIntent,
  resolved: ResolvedChatKnobs,
): ClaudeRuntimeOverrides {
  const compMode = params.compaction?.mode;
  const disableAutoCompact = compMode === "off" || compMode === "managed";
  const thresholdPct = params.compaction?.thresholdPct;
  const autoCompactPct =
    compMode === "auto" && thresholdPct !== undefined
      ? Math.round(thresholdPct * PCT_SCALE)
      : undefined;
  return {
    maxOutputTokens: resolved.maxOutputTokens,
    maxContextTokens: params.maxContextTokens,
    // The env DISABLE_THINKING floor must yield to our typed Option when thinking is ON; leave undefined
    // when OFF so the env default (disable) engages and matches `thinking:{type:'disabled'}`.
    disableThinking: resolved.reasoning.enabled ? false : undefined,
    disableAutoCompact: disableAutoCompact ? true : undefined,
    autoCompactPct,
    ...(params.advanced?.claudeEnv !== undefined ? { userEnv: params.advanced.claudeEnv } : {}),
  };
}

/**
 * Project `UserIntent` × `ModelCapability` into the agent-sdk's two output surfaces — the typed SDK
 * Options (thinking/effort/maxBudgetUsd) and the env overrides (output/context caps, compaction, the
 * escape hatch). Calls the ONE `resolve-chat` funnel for the gated decision, then MAPS it to SDK shape.
 */
export function toSdkGeneration(
  params: UserIntent,
  capability: ModelCapability,
): {
  envOverrides: ClaudeRuntimeOverrides;
  options: SdkGenerationOptions;
  warnings: readonly ResolvedWarning[];
} {
  const resolved = resolveChat(params, capability);
  return {
    envOverrides: buildEnvOverrides(params, resolved),
    options: buildGenerationOptions(params, resolved),
    // resolve-chat's dropped/ignored-knob notes — the agent-sdk runner surfaces them as `warning` events.
    warnings: resolved.warnings,
  };
}
