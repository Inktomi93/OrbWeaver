// infra/providers/backends/agent-sdk/translate — the request→SDK-options builder. THREE jobs:
//   • disciplineOptions — THE FIREWALL BASE: `tools:[]` (no built-in tools) + the cowork denylist +
//     `strictMcpConfig` + empty `settingSources` + the per-credential env (env.ts). This is the shape
//     both the roleplay runner and the agent runner start from; the asymmetry the agent runner adds
//     (an MCP server + maxTurns) is the only difference.
//   • buildSystemPrompt — join our static/dynamic halves into the ONE leak-free string the SDK sends
//     (`static + "\n\n" + dynamic`). The native `[static, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic]` array
//     form is FORBIDDEN here — the runtime split is flag-gated OFF in the bundled CLI, so the marker rides
//     through as visible prompt text (see the fn doc for the b1 probe receipt). Any copy of the marker in
//     user text is still stripped first — see `stripBoundaryMarker`.
//   • toSdkGeneration — call the ONE funnel (`infra/providers/resolve-chat.ts`) that owns intent→knob
//     POLICY, then MAP its resolved decision into the SDK's two output surfaces: the typed generation
//     Options (thinking/effort/maxBudgetUsd) + the env overrides (output/context caps, compaction, the
//     escape hatch). ALL the gating/clamp/guard logic now lives in resolve-chat (invariant #9); this file
//     keeps only the SDK-vocab SHAPE mapping (`toSdkEffort`, the `ThinkingConfig` build).

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
/** The leak-proof discipline SHAPE (no env) — the ONE home for the firewall base fields both
 *  `disciplineOptions` and the mode-1 model-discovery spawn (`catalog.ts`) start from. Kept env-free so a
 *  caller pairs it with the per-mode `buildClaude*Env` output. */
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
      // mode-1: the free sub. Tier aliases resolve to the sub's own catalog — no OR-slug map applies.
      return { ...base, env: buildClaudeSdkEnv(overrides) };
    case "openrouter":
      // mode-2: the OR-skin. The tier→slug map is REQUIRED — the connection domain derives it and threads
      // it on the request; its absence here is a programming error (never a hardcoded fallback in infra).
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
      // mode-3: loopback vLLM. All tiers map to the single served model (the env builder handles it).
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
 * The mid-conversation OPERATOR-CONTEXT seam: a programmatic `UserPromptSubmit` hook whose
 * `additionalContext` the runtime injects adjacent to the user prompt (a `<system-reminder>`-style body;
 * on models carrying the `mid-conversation-system-2026-04-07` beta the runtime promotes operator context
 * to a true `role:"system"` message and auto-falls-back with a sticky beta-reject when the server 400s —
 * verified in the bundled 0.3.205 runtime). CACHE-SAFE by construction: the injected text rides the
 * message TAIL, so the static system prompt and the resumed history prefix stay byte-stable — unlike a
 * dynamic system-prompt tail, which re-writes the whole system block on every change. Programmatic hooks
 * ride the control channel, NOT `settingSources` — the firewall's `settingSources: []` (which exists to
 * kill settings-smuggled hooks) does not disable this. NOT wired into the live turn yet: the runner still
 * sends the joined static+dynamic systemPrompt; this seam exists for the cache probe
 * (`packages/server/scripts/sdk-cache-probe.ts`) and the planned dynamic-tail migration it will justify.
 */
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

/**
 * Remove every copy of the boundary sentinel SUBSTRING from a system-prompt half. LEAK-PROOFING, not
 * cosmetics: the pinned CLI locates the static/dynamic split by EXACT ELEMENT IDENTITY
 * (`findIndex(c => c === SYSTEM_PROMPT_DYNAMIC_BOUNDARY)`) over the `string[]`, and a marker buried
 * INSIDE a string block is neither detected nor rejected — it silently rides through as visible prompt
 * text (the neo literal-leak bug). User-supplied preset content could contain the marker (verbatim or
 * pasted), so we scrub BOTH halves before assembly: after this, the ONLY occurrence of the sentinel in
 * the emitted `systemPrompt` is the standalone const element `buildSystemPrompt` inserts itself. The
 * `.split(marker).join("")` form removes ALL occurrences (including adjacent/repeated) without a regex.
 */
function stripBoundaryMarker(text: string): string {
  return text.split(SYSTEM_PROMPT_DYNAMIC_BOUNDARY).join("");
}

/**
 * Join the assembled static/dynamic system-prompt halves into the ONE leak-free string the SDK sends
 * (`static + "\n\n" + dynamic`). Any copy of the boundary marker inside either half is stripped first
 * ({@link stripBoundaryMarker}) so the sentinel never appears in the emitted prompt at all.
 *
 * WHY NOT the SDK's `[static, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic]` array form (which its own d.ts
 * documents as the static/dynamic cache split): the runtime's array split
 * (`findIndex(c => c === SYSTEM_PROMPT_DYNAMIC_BOUNDARY)`) is FLAG-GATED (`OXe()` in the binary) and the
 * gate is OFF in the bundled CLI, so the array elements are joined WITH the marker included and it reaches
 * the model verbatim.
 *   b1 2026-07-10, SDK 0.3.206: marker as a standalone array element still reached the model verbatim —
 *   the runtime split is flag-gated OFF; the array+boundary form is FORBIDDEN here until a b1 run passes
 *   clean. Probe b1 is the canary.
 * We trade the explicit static-prefix cache split for a leak-free prompt; the SDK still caches the joined
 * system prompt internally.
 *
 * Shape decisions (why each half maps as it does):
 *   • nothing to send            → undefined (the SDK falls back to its own default).
 *   • dynamic empty/whitespace   → plain `static` STRING.
 *   • static empty, dynamic set  → plain `dynamic` STRING.
 *   • both present               → `static + "\n\n" + dynamic` (the leak-free join).
 * The `string | string[] | undefined` return type is retained (the runner already widened to accept it)
 * even though the array arm is gone — harmless, and it keeps the door open for a b1-clean array form later.
 */
export function buildSystemPrompt(
  sp: { static: string; dynamic: string } | undefined,
): string | string[] | undefined {
  if (sp === undefined) {
    return;
  }
  // Strip BEFORE trim: removing a marker can expose trimmable whitespace (e.g. two adjacent markers
  // separated by a space collapse to " "), so a half that was ONLY marker-copies must resolve to empty.
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
  turnId: string;
} {
  const resolved = resolveChat(params, capability);
  return {
    envOverrides: buildEnvOverrides(params, resolved),
    options: buildGenerationOptions(params, resolved),
    // resolve-chat's dropped/ignored-knob notes — the agent-sdk runner surfaces them as `warning` events.
    warnings: resolved.warnings,
    // The per-turn correlation id (part 05 §4) — the runner threads it into every `provider.*` line for
    // this turn (`routeDynamicContext`'s `provider.channel`, `provider.turn`).
    turnId: resolved.turnId,
  };
}
