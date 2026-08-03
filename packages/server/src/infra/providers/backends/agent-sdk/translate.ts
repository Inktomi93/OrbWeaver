// The request→SDK-options builder: disciplineOptions (the firewall base), buildSystemPrompt (join the
// static/dynamic halves leak-free), and toSdkGeneration (map resolve-chat's decision to SDK shape — all
// gating/clamp/guard logic lives in resolve-chat, this file only maps SDK vocab).

import type { EffortLevel, HookJSONOutput, Options, ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import type { OrSkinTierModels, ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import { resolveChat } from "../../resolve-chat.ts";
import type { ClaudeRuntimeOverrides } from "./env.ts";
import { buildClaudeOpenRouterEnv, buildClaudeSdkEnv } from "./env.ts";
import type { DisciplineOptions } from "./types.ts";

// tools:[] alone does NOT remove the cowork bundle (leaks in regardless of env/settingSources); disallowedTools does.
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"] as const;

/** The in-process MCP server namespace — the ONE name both the agent runner's `mcpServers` mount and the
 *  chat runner's tool mount key on (`allowedTools: mcp__<ns>__*`). */
export const MCP_NAMESPACE = "orbweaver";
/** The TERMINAL-tool mount's own MCP namespace (D112 R1) — deliberately NOT {@link MCP_NAMESPACE}: the
 *  registry mount is allow-listed (`mcp__orbweaver__*`, the SDK executes it), while a terminal tool must be
 *  DENIED at the permission seam so it never executes and never earns a second model call. One namespace per
 *  fate keeps the allowlist, the deny hook, and the capture filter reading the same name. */
export const TERMINAL_MCP_NAMESPACE = "orbstate";
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
          message: "agent-sdk: an openrouter (mode-2) turn requires orSkinTierModels (derived by connection).",
        });
      }
      return {
        ...base,
        env: buildClaudeOpenRouterEnv(credential.apiKey, orSkinTierModels, overrides),
      };

    case "vllm":
    case "local-light":
    case "custom_openai":
      // Not a Claude-runtime source. `vllm` was RETIRED from agent-sdk (owner ruling 2026-07-27): local
      // vLLM chat runs on the chat-completions surface only. Every other source refuses here as before —
      // the agent-sdk backend serves only the sub + the OR-Anthropic skin.
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `agent-sdk: unsupported credential source "${credential.source}" (max-pro-sub / openrouter skin only)`,
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
export function buildSystemPrompt(sp: { static: string; dynamic: string } | undefined): string | string[] | undefined {
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

// NO `maxBudgetUsd`: the preset knob that fed it is DELETED (owner ruling 2026-08-02 — it had no editor on
// any surface, so nothing could ever set it and this branch was unreachable in practice). The SDK's own
// `error_max_budget_usd` result subtype is UNRELATED and stays classified in verify.ts — that is the
// provider reporting ITS ceiling, not ours.
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

// Takes only `resolved`: with `maxBudgetUsd` retired, every generation option this builds comes from the
// FUNNEL's output, never from the raw intent. (`buildEnvOverrides` beside it still needs both.)
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

function buildEnvOverrides(params: UserIntent, resolved: ResolvedChatKnobs): ClaudeRuntimeOverrides {
  // COMPACTION MODE → SDK env (the agent-sdk RUNNER axis, uniform across ALL backends this runner serves —
  // local vLLM / OpenRouter skin / max-pro-sub; NEVER a per-backend branch):
  //   • managed / off → DISABLE_AUTO_COMPACT: WE own compaction (managed) or nobody does (off). Our managed
  //     LINEAR marker (domain/chat/verbs/compaction) is the compaction layer; SDK-native must not fire under it.
  //   • auto → SDK-NATIVE compaction at CLAUDE_AUTOCOMPACT_PCT_OVERRIDE. HONEST-DEGRADE: SDK-native compaction
  //     never exposes its summary to us, so `auto` yields NO stored marker → no carry-forward on an api swap and no
  //     divider memory-fact (the preset UI says this plainly on the `auto` option — plan-for-small-hardware).
  //     KNOWN GAP (probes 2026-07-24, bounded — local vLLM + hosted max-pro-sub): auto-mode turns SUCCEED on both
  //     backends, but whether SDK-native compaction actually FIRES (vs. no-ops) was NOT positively confirmed within
  //     bounded effort — the `compact_boundary` event needs server-log/session-frame capture, and the hosted Opus
  //     turns were too slow to iterate a frame-capture harness cheaply. Best-effort session-frame extraction of the
  //     SDK's own summary (to lift the degrade) stays SANCTIONED but EVIDENCE-GATED — NOT built, since firing is
  //     unconfirmed and speculative extraction was ruled out. If a future probe confirms firing + characterizes the
  //     frame format, extraction lands HERE (this backend module), behind a real captured-session fixture test,
  //     falling back to this degrade on a scan miss.
  // POLICY IS UNIFORM PER-BACKEND; only the SDK-native compaction BEHAVIOR may differ per backend. The env NAMES
  // are pinned against the bundled runtime by
  // tests/server/infra/providers/backends/agent-sdk/env-runtime-parity.test.ts (verified present, bundle 2.1.216
  // — neo's non-CLAUDE_CODE_-prefixed names are REAL runtime keys, not silent no-ops).
  //
  // HOSTED TRIGGER FINDING (probe 2026-07-24, max-pro-sub): on the agent-sdk STATEFUL path the SDK RESUMES its
  // session, so provider `tokensIn` reports the per-turn DELTA (~2 tokens), NOT cumulative context. The managed
  // pct trigger therefore reads the DOMAIN FIT ESTIMATE (cumulative over full canon) as authoritative, not provider
  // usage (engine.ts `compactionTriggered`) — managed compaction fires on hosted via the fit ceiling, not a
  // provider-usage crossing that never comes on a resuming session.
  const compMode = params.compaction?.mode;
  // MANAGED disables the SDK's native auto-compact (WE own compaction via the LINEAR marker). `auto` leaves it
  // LIVE. There is no "off" (owner ruling: compaction is a safety property — a chat may never error from context
  // growth). An ABSENT mode falls through to the resolved managed default, so its SDK env matches managed.
  const disableAutoCompact = compMode === "managed" || compMode === undefined;
  const thresholdPct = params.compaction?.thresholdPct;
  const autoCompactPct = compMode === "auto" && thresholdPct !== undefined ? Math.round(thresholdPct * PCT_SCALE) : undefined;
  // maxContextTokens ONLY when auto-compact is LIVE. CLAUDE_CODE_MAX_CONTEXT_TOKENS tells the SDK to keep its
  // working set UNDER that cap — but the SDK's ONLY mechanism to honor it is auto-compaction. With auto-compact
  // DISABLED (managed), an over-cap prompt has no way to fit and the SDK fails the turn (`is_error` — verified
  // live on vLLM: managed + maxContextTokens = hard turn error; either alone succeeds). So under managed we DROP
  // the cap from the SDK env: managed's post-turn LINEAR marker (domain/chat/verbs/compaction) is the trim, not a
  // hard SDK cap. The DOMAIN fit-pass still reads the preset cap for the stateless path — this drop is SDK-only.
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
    options: buildGenerationOptions(resolved),
    warnings: resolved.warnings,
    turnId: resolved.turnId,
  };
}
