// The request→SDK-options builder: `disciplineOptions` (the firewall base over the per-connection child env),
// `buildSystemPrompt` (join the static/dynamic halves leak-free), `toSdkGeneration` (map the funnel's decision
// to SDK shape — every gating/clamp/guard lives in `funnel/resolve-chat.ts`; this file only spells SDK vocab).

import type { EffortLevel, HookJSONOutput, Options, ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";
import type { AdjustedKnob } from "@orb/contracts/chat";
import { ADJUSTED_KNOBS } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import type { ClaudeRuntimeOverrides } from "./env.ts";
import type { AgentSdkLog } from "./log.ts";
import type { DisciplineOptions } from "./types.ts";

// tools:[] alone does NOT remove the cowork bundle (leaks in regardless of env/settingSources); disallowedTools does.
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"] as const;

/** The in-process MCP server namespace — the ONE name both the agent runner's `mcpServers` mount and the
 *  chat runner's tool mount key on (`allowedTools: mcp__<ns>__*`). */
export const MCP_NAMESPACE = "orbweaver";
/** The TERMINAL-tool mount's own MCP namespace (D112 R1) — deliberately NOT {@link MCP_NAMESPACE}: the
 *  registry mount is allow-listed (the SDK executes it), while a terminal tool must be DENIED at the permission
 *  seam so it never executes and never earns a second model call. */
export const TERMINAL_MCP_NAMESPACE = "orbstate";
const PCT_SCALE = 100;

/** The env-free discipline shape shared by `disciplineOptions` and the model-discovery spawn. */
function firewallBase(): Omit<DisciplineOptions, "env"> {
  return {
    disallowedTools: [...COWORK_DENYLIST],
    tools: [] as string[],
    mcpServers: {} as Record<string, never>,
    strictMcpConfig: true as const,
    settingSources: [] as never[],
  };
}

export function disciplineOptions(env: Record<string, string | undefined>): DisciplineOptions {
  return { ...firewallBase(), env };
}

/** Opt-in subprocess observability. Kept out of `disciplineOptions` so that helper stays the pure leak contract. */
export function observabilityOptions(debug: boolean, log: AgentSdkLog): { debug?: boolean; stderr?: (data: string) => void } {
  if (!debug) {
    return {};
  }
  return {
    debug: true,
    stderr: (data: string): void => {
      log.debug({ sdk: "stderr" }, data.trimEnd());
    },
  };
}

// Mid-conversation operator-context seam: a UserPromptSubmit hook injecting additionalContext adjacent to
// the user prompt. Cache-safe by construction: the static system prompt and resumed history stay byte-stable.
export function dynamicContextOptions(context: string): Pick<Options, "hooks"> {
  const text = context.trim();
  if (text.length === 0) {
    return {};
  }
  return {
    hooks: {
      UserPromptSubmit: [
        { hooks: [(): Promise<HookJSONOutput> => Promise.resolve({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } })] },
      ],
    },
  };
}

// Leak-proofing: user content could contain the boundary sentinel, which would ride through as prompt text.
function stripBoundaryMarker(text: string): string {
  return text.split(SYSTEM_PROMPT_DYNAMIC_BOUNDARY).join("");
}

/** Joins static+dynamic into ONE leak-free string (the SDK's array form is flag-gated OFF in the bundled CLI). */
export function buildSystemPrompt(sp: { static: string; dynamic: string } | undefined): string | undefined {
  if (sp === undefined) {
    return;
  }
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

// Policy already ran in the funnel; pure SDK-shape map. if-blocks not switch: biome under-resolves the union.
function buildThinking(reasoning: ResolvedReasoning): ThinkingConfig {
  const displayPart = reasoning.display !== undefined ? { display: reasoning.display } : {};
  const { mode } = reasoning;
  if (mode === "adaptive") {
    return { type: "adaptive", ...displayPart };
  }
  if (mode === "budget") {
    return { type: "enabled", ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}), ...displayPart };
  }
  return { type: "enabled", ...displayPart };
}

function buildGenerationOptions(resolved: ResolvedChatKnobs): SdkGenerationOptions {
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
  return options;
}

// COMPACTION MODE → SDK env: managed/absent → DISABLE_AUTO_COMPACT (WE own compaction via the LINEAR marker);
// auto → SDK-native compaction at the pct. `maxContextTokens` rides ONLY when auto-compact is LIVE — with it
// disabled the runtime has no mechanism to honour the cap and fails the turn (#1541).
function buildEnvOverrides(params: UserIntent, resolved: ResolvedChatKnobs): ClaudeRuntimeOverrides {
  const compMode = params.compaction?.mode;
  const disableAutoCompact = compMode === "managed" || compMode === undefined;
  const thresholdPct = params.compaction?.thresholdPct;
  const autoCompactPct = compMode === "auto" && thresholdPct !== undefined ? Math.round(thresholdPct * PCT_SCALE) : undefined;
  const sdkMaxContextTokens = disableAutoCompact ? undefined : params.maxContextTokens;
  return {
    maxOutputTokens: resolved.maxOutputTokens,
    ...(sdkMaxContextTokens !== undefined ? { maxContextTokens: sdkMaxContextTokens } : {}),
    disableThinking: resolved.reasoning.enabled ? false : undefined,
    disableAutoCompact: disableAutoCompact ? true : undefined,
    autoCompactPct,
    ...(params.advanced?.claudeEnv !== undefined ? { userEnv: params.advanced.claudeEnv } : {}),
  };
}

/** The SDK's feature name → our knob vocabulary when the two agree — the same `knobOf` idiom
 *  `backends/v4/result.ts` uses for the hosted wires' SDK warnings, not a second mapping. A resolved knob
 *  with no `AdjustedKnob` of our own still drops loudly; it simply rides as prose, exactly as it does there. */
function knobOf(name: string): AdjustedKnob | undefined {
  return ADJUSTED_KNOBS.find((knob) => knob === name);
}

/**
 * THE SAMPLER DROP (D41, no silent degrade). `buildGenerationOptions` above spells ONLY `thinking` and
 * `effort`: the bundled Claude runtime exposes no sampler knob at all, so every resolved `temperature` /
 * `topP` / `topK` / penalty / `seed` / `stop` reaching this translation is a knob that will NOT be sent. It
 * used to be discarded here in silence while `resolveChat` had already resolved it and `log.sampling`'s
 * `applied` receipt reported it as applied — the exact shape D41 forbids, and the shape the cross-backend
 * conformance suite caught on 2026-09-20 (the two hosted wires either send the knob or announce the drop).
 *
 * TODAY THIS EMITS NOTHING, BY CONSTRUCTION: `capability/sources/curated/anthropic.ts`'s `wire: "agent-sdk"`
 * row states `sampling: {}`, so the funnel drops each preset knob with its own `sampling_knob_dropped` long
 * before translation runs and `resolved.sampling` arrives empty. That is not a reason to skip this. The
 * capability fold puts `declared` ABOVE curated (§6.2 — "the user's box is the truth about the user's box"),
 * so a user writing a `declared.sampling` block on a `claude-sub` connection widens the axis with no code
 * change and no review, and the silent path opens for them alone. The guard was one unasserted data row;
 * now the code holds it and the row is pinned besides
 * (`tests/inference/conformance/unsupported-settings.suite.test.ts`).
 */
function droppedSamplerWarnings(resolved: ResolvedChatKnobs): ResolvedWarning[] {
  const out: ResolvedWarning[] = [];
  for (const [name, value] of Object.entries(resolved.sampling)) {
    if (value === undefined) {
      continue;
    }
    const knob = knobOf(name);
    out.push({
      code: "sampling_knob_dropped",
      ...(knob !== undefined ? { knob } : {}),
      message: `${name} ignored: the bundled Claude runtime exposes no sampler knob on the agent-sdk wire`,
    });
  }
  return out;
}

export function toSdkGeneration(
  params: UserIntent,
  capability: GenerationCapability,
): {
  envOverrides: ClaudeRuntimeOverrides;
  options: SdkGenerationOptions;
  warnings: readonly ResolvedWarning[];
  turnId: string;
  knobs: ResolvedChatKnobs;
} {
  const resolved = resolveChat(params, capability);
  return {
    envOverrides: buildEnvOverrides(params, resolved),
    options: buildGenerationOptions(resolved),
    warnings: [...resolved.warnings, ...droppedSamplerWarnings(resolved)],
    turnId: resolved.turnId,
    knobs: resolved,
  };
}
