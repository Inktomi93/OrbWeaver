// The request→SDK-options builder: disciplineOptions (the firewall base), buildSystemPrompt (join the
// static/dynamic halves leak-free), and toSdkGeneration (map resolve-chat's decision to SDK shape — all
// gating/clamp/guard logic lives in resolve-chat, this file only maps SDK vocab).

import type {
  EffortLevel,
  HookJSONOutput,
  Options,
  ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import type {
  OrSkinTierModels,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedWarning,
} from "../../contract";
import { ProviderError } from "../../contract";
import { resolveChat } from "../../resolve-chat";
import type { ClaudeRuntimeOverrides } from "./env";
import { buildClaudeOpenRouterEnv, buildClaudeSdkEnv, buildClaudeVllmEnv } from "./env";
import type { DisciplineOptions } from "./types";

// tools:[] alone does NOT remove the cowork bundle (leaks in regardless of env/settingSources); disallowedTools does.
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"] as const;
const PCT_SCALE = 100;

// Env-free discipline shape shared by disciplineOptions and the mode-1 model-discovery spawn (catalog.ts).
export function firewallBase(): Omit<DisciplineOptions, "env"> {
  return {
    disallowedTools: [...COWORK_DENYLIST],
    tools: [] as string[],
    mcpServers: {} as Record<string, never>,
    strictMcpConfig: true as const,
    settingSources: [] as never[],
  };
}

export function disciplineOptions(
  credential: ResolvedCredential,
  orSkinTierModels: OrSkinTierModels | undefined,
  overrides: ClaudeRuntimeOverrides = {},
): DisciplineOptions {
  const base = firewallBase();
  switch (credential.source) {
    case "max-pro-sub":
      return { ...base, env: buildClaudeSdkEnv(overrides) };
    case "openrouter":
      // Tier→slug map is required — connection derives it and threads it on the request.
      if (orSkinTierModels === undefined) {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message:
            "agent-sdk: an openrouter (mode-2) turn requires orSkinTierModels (derived by connection).",
        });
      }
      return {
        ...base,
        env: buildClaudeOpenRouterEnv(credential.apiKey, orSkinTierModels, overrides),
      };
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

// Opt-in subprocess observability at LOG_LEVEL debug/trace. Kept out of disciplineOptions so that helper
// stays the pure leak contract the tests lock.
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

// Mid-conversation operator-context seam: a UserPromptSubmit hook injecting additionalContext adjacent to
// the user prompt. Cache-safe by construction: the injected text rides the message tail, so the static
// system prompt and resumed history prefix stay byte-stable.
export function dynamicContextOptions(context: string): Pick<Options, "hooks"> {
  const text = context.trim();
  if (text.length === 0) {
    return {};
  }
  return {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            (): Promise<HookJSONOutput> =>
              Promise.resolve({
                hookSpecificOutput: {
                  hookEventName: "UserPromptSubmit",
                  additionalContext: text,
                },
              }),
          ],
        },
      ],
    },
  };
}

// Leak-proofing, not cosmetics: user-supplied content could contain the boundary sentinel, which would
// otherwise ride through as visible prompt text.
function stripBoundaryMarker(text: string): string {
  return text.split(SYSTEM_PROMPT_DYNAMIC_BOUNDARY).join("");
}

// Joins static+dynamic into ONE leak-free string. The SDK's [static, BOUNDARY, dynamic] array form is
// forbidden here: the bundled CLI's array split is flag-gated OFF, so the marker reaches the model verbatim.
export function buildSystemPrompt(
  sp: { static: string; dynamic: string } | undefined,
): string | string[] | undefined {
  if (sp === undefined) {
    return;
  }
  // Strip before trim: removing a marker can expose trimmable whitespace.
  const staticPart = stripBoundaryMarker(sp.static).trim();
  const dynamicPart = stripBoundaryMarker(sp.dynamic).trim();
  if (staticPart.length === 0 && dynamicPart.length === 0) {
    return;
  }
  if (dynamicPart.length === 0) {
    return staticPart;
  }
  if (staticPart.length === 0) {
    return dynamicPart;
  }
  return `${staticPart}\n\n${dynamicPart}`;
}

interface SdkGenerationOptions {
  thinking?: ThinkingConfig;
  effort?: EffortLevel;
  maxBudgetUsd?: number;
}

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

// Policy (effort clamp, display gate, adaptive/budget guard) already ran in resolve-chat; pure SDK-shape map.
function buildThinking(reasoning: ResolvedReasoning): ThinkingConfig {
  const displayPart = reasoning.display !== undefined ? { display: reasoning.display } : {};
  // if-blocks not switch: biome's noUnnecessaryConditions under-resolves the cross-package union and false-flags cases unreachable.
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
  return { type: "enabled", ...displayPart };
}

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
    disableThinking: resolved.reasoning.enabled ? false : undefined,
    disableAutoCompact: disableAutoCompact ? true : undefined,
    autoCompactPct,
    ...(params.advanced?.claudeEnv !== undefined ? { userEnv: params.advanced.claudeEnv } : {}),
  };
}

export function toSdkGeneration(
  params: UserIntent,
  capability: ModelCapability,
): {
  envOverrides: ClaudeRuntimeOverrides;
  options: SdkGenerationOptions;
  warnings: readonly ResolvedWarning[];
  turnId: string;
} {
  const resolved = resolveChat(params, capability);
  return {
    envOverrides: buildEnvOverrides(params, resolved),
    options: buildGenerationOptions(params, resolved),
    warnings: resolved.warnings,
    turnId: resolved.turnId,
  };
}
