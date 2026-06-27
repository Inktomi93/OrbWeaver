// infra/providers/backends/agent-sdk/translate — the request→SDK-options builder. THREE jobs:
//   • disciplineOptions — THE FIREWALL BASE: `tools:[]` (no built-in tools) + the cowork denylist +
//     `strictMcpConfig` + empty `settingSources` + the per-credential env (env.ts). This is the shape
//     both the roleplay runner and the agent runner start from; the asymmetry the agent runner adds
//     (an MCP server + maxTurns) is the only difference.
//   • buildSystemPrompt — join our static/dynamic halves into the one string the SDK sends.
//   • toSdkGeneration — project the SDK-free `UserIntent` × `ModelCapability` into the SDK's typed
//     generation Options (thinking/effort/maxBudgetUsd) + the env overrides (output/context caps,
//     compaction, the escape hatch). ZERO model-quirk hunting beyond reading the descriptor.
//
// FLAG (boundary): in neo the runner consumed an already-resolved `ResolvedChat`; orbweaver's request
// carries the RAW `UserIntent` + the `ModelCapability` descriptor, and `infra/providers/resolve-chat.ts`
// (the funnel that owns intent→knob POLICY) is a separate, not-yet-built slice. So this projection lives
// here for now — conservative + descriptor-driven (it honors `reasoning.mode`/`effortLevels`/
// `displayModes`/`output.maxTokens`). When resolve-chat lands, the policy half should move there and this
// file should consume the resolved shape.

import type { EffortLevel, ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import { ProviderError } from "../../contract";
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

/** The display knob is Anthropic-only — gate it on the descriptor so a non-Anthropic model (reachable
 *  via the OR skin) never receives an unsupported field. */
function resolveDisplay(
  params: UserIntent,
  capability: ModelCapability,
): "summarized" | "omitted" | undefined {
  const wanted = params.thinkingDisplay;
  if (wanted === undefined) {
    return;
  }
  return capability.reasoning.displayModes?.includes(wanted) === true ? wanted : undefined;
}

/** Only emit an effort level the model actually lists (when it publishes a set); otherwise pass it
 *  through (the model/SDK applies its own default). */
function gateEffort(
  effort: EffortLevel | undefined,
  capability: ModelCapability,
): EffortLevel | undefined {
  if (effort === undefined) {
    return;
  }
  const levels = capability.reasoning.effortLevels;
  if (levels !== undefined && !levels.includes(effort)) {
    return;
  }
  return effort;
}

/** Build the SDK thinking Option from the descriptor's reasoning mode. The adaptive/budget guard
 *  (providers.md Esoteric §8) is honored structurally: the `adaptive` arm NEVER carries `budgetTokens`,
 *  so Opus-4.8-class models that 400 on `enabled + budget_tokens` get clean `adaptive`. */
function buildThinking(params: UserIntent, capability: ModelCapability): ThinkingConfig {
  const display = resolveDisplay(params, capability);
  const displayPart = display !== undefined ? { display } : {};
  // if-blocks (not a `switch`) on the descriptor mode: biome's `noUnnecessaryConditions` under-resolves
  // the cross-package `z.infer` `ReasoningMode` union on a switch discriminant and false-flags the
  // adaptive/budget cases as unreachable — tsc sees all four members (verified via a type probe).
  const mode = capability.reasoning.mode;
  if (mode === "adaptive") {
    return { type: "adaptive", ...displayPart };
  }
  if (mode === "budget") {
    const range = capability.reasoning.budgetRange;
    const requested = params.thinkingBudgetTokens ?? range?.max;
    const budgetTokens =
      requested !== undefined && range !== undefined
        ? Math.min(Math.max(requested, range.min), range.max)
        : requested;
    return {
      type: "enabled",
      ...(budgetTokens !== undefined ? { budgetTokens } : {}),
      ...displayPart,
    };
  }
  // "effort" (and the defensive "none"-but-enabled case): plain enabled; the effort level rides on the
  // top-level `options.effort` (set by `buildGenerationOptions`).
  return { type: "enabled", ...displayPart };
}

/** Whether thinking engages for this turn: the model must SUPPORT reasoning AND the user must have asked
 *  for it (a real effort, not `none`). The single source the options + env builders share. */
function isThinkingOn(params: UserIntent, capability: ModelCapability): boolean {
  return capability.reasoning.enabled && params.effort !== undefined && params.effort !== "none";
}

/** The typed SDK generation Options half of the projection (thinking + effort + budget). */
function buildGenerationOptions(
  params: UserIntent,
  capability: ModelCapability,
): SdkGenerationOptions {
  const options: SdkGenerationOptions = {};
  if (isThinkingOn(params, capability)) {
    options.thinking = buildThinking(params, capability);
    if (capability.reasoning.mode === "effort" || capability.reasoning.mode === "adaptive") {
      const effort = gateEffort(toSdkEffort(params.effort), capability);
      if (effort !== undefined) {
        options.effort = effort;
      }
    }
  } else {
    options.thinking = { type: "disabled" };
  }
  if (params.maxBudgetUsd !== undefined) {
    options.maxBudgetUsd = params.maxBudgetUsd;
  }
  return options;
}

/** The env-overrides half of the projection (output/context caps, compaction, the escape hatch). */
function buildEnvOverrides(
  params: UserIntent,
  capability: ModelCapability,
): ClaudeRuntimeOverrides {
  const compMode = params.compaction?.mode;
  const disableAutoCompact = compMode === "off" || compMode === "managed";
  const thresholdPct = params.compaction?.thresholdPct;
  const autoCompactPct =
    compMode === "auto" && thresholdPct !== undefined
      ? Math.round(thresholdPct * PCT_SCALE)
      : undefined;
  return {
    maxOutputTokens: clampOutput(params.maxOutputTokens, capability),
    maxContextTokens: params.maxContextTokens,
    // The env DISABLE_THINKING floor must yield to our typed Option when thinking is ON; leave undefined
    // when OFF so the env default (disable) engages and matches `thinking:{type:'disabled'}`.
    disableThinking: isThinkingOn(params, capability) ? false : undefined,
    disableAutoCompact: disableAutoCompact ? true : undefined,
    autoCompactPct,
    ...(params.advanced?.claudeEnv !== undefined ? { userEnv: params.advanced.claudeEnv } : {}),
  };
}

/** Clamp a requested output cap into the descriptor's allowed range (the descriptor is the truth for
 *  "what this model accepts"); pass through untouched when unset. */
function clampOutput(
  requested: number | undefined,
  capability: ModelCapability,
): number | undefined {
  if (requested === undefined) {
    return;
  }
  const { min, max } = capability.output.maxTokens;
  return Math.min(Math.max(requested, min), max);
}

/**
 * Project `UserIntent` × `ModelCapability` into the agent-sdk's two output surfaces — the typed SDK
 * Options (thinking/effort/maxBudgetUsd) and the env overrides (output/context caps, compaction, the
 * escape hatch). Thinking engages only when the model SUPPORTS reasoning (`capability.reasoning.enabled`)
 * AND the user asked for it (a real effort, not `none`); otherwise it stays off (and the env default
 * `CLAUDE_CODE_DISABLE_THINKING` matches `thinking:{type:'disabled'}`).
 */
export function toSdkGeneration(
  params: UserIntent,
  capability: ModelCapability,
): { envOverrides: ClaudeRuntimeOverrides; options: SdkGenerationOptions } {
  return {
    envOverrides: buildEnvOverrides(params, capability),
    options: buildGenerationOptions(params, capability),
  };
}
