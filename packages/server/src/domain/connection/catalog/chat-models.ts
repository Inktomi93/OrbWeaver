// The curated Claude shortlist the connection catalog selects FROM for the agent-sdk + Claude-via-OR paths.
// `getChatModel`'s 3-stage prefix-match is LOAD-BEARING: OpenRouter uses version-only ids while the curated
// catalog uses the dated form; stage 3 prefix-matches with a boundary check (next char must be `-`) so
// `claude-haiku-4-5` resolves to the dated entry but `claude-haiku-4` doesn't match `claude-haiku-45-…`.

import type { ChatModelId, ModelCapability } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** Anchored so a third-party fork like `some-org/claude-fork-sonnet` never false-matches. */
const CLAUDE_TIER_RE = /(?:^|[/-])claude[-/](?<tier>opus|sonnet|haiku)(?:$|[-.])/i;

const CLAUDE_CONTEXT_WINDOW = 200_000;
const CLAUDE_MAX_OUTPUT = 64_000;
const HAIKU_MAX_OUTPUT = 8192;
const MIN_OUTPUT = 1;

/** The opus/sonnet reasoning display knobs (Anthropic-only — summarized thinking or omitted). */
const CLAUDE_DISPLAY_MODES = ["summarized", "omitted"] as const;

/** A curated shortlist entry; `sampling` is `{}` for every entry — agent-sdk honors no sampling knob. */
interface CuratedChatModel {
  readonly id: ChatModelId;
  /** Coarse family tier (label/grouping only — not load-bearing for selection). */
  readonly tier: "opus" | "sonnet" | "haiku";
  readonly label: string;
  readonly capability: ModelCapability;
}

export const CHAT_MODELS: readonly CuratedChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL_ID,
    tier: "opus",
    label: "Opus 4.8",
    capability: {
      // Opus 4.8 reasons adaptively: the infra funnel drops budget_tokens when mode === 'adaptive'.
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        displayModes: [...CLAUDE_DISPLAY_MODES],
      },
      sampling: {},
      // Claude supports all three (parallel tool use · structured output · image content-parts); no image
      // editing (§U0 / IC-A — `imageEdit` stays absent, not a Claude capability).
      input: { vision: true },
      tools: { parallel: true },
      output: { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT }, structured: true },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: true },
    },
  },
  {
    id: castId<ChatModelId>("claude-sonnet-5"),
    tier: "sonnet",
    label: "Sonnet 5",
    capability: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        displayModes: [...CLAUDE_DISPLAY_MODES],
      },
      sampling: {},
      input: { vision: true },
      tools: { parallel: true },
      output: { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT }, structured: true },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  },
  {
    id: castId<ChatModelId>("claude-sonnet-4-6"),
    tier: "sonnet",
    label: "Sonnet 4.6",
    capability: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        displayModes: [...CLAUDE_DISPLAY_MODES],
      },
      sampling: {},
      input: { vision: true },
      tools: { parallel: true },
      // structured: true — Sonnet 4.6 supports structured output (Anthropic native + the Claude-via-OR
      // path) while OpenRouter's catalog does NOT advertise `structured_outputs` for it. Curating the entry
      // was the original fix for exactly one model; the general one is `CLAUDE_CAPABILITY_FLOOR` below,
      // which the OR synthesis applies to every RECOGNIZED-but-uncurated Claude. This entry still carries
      // its own bounds/reasoning truth.
      output: { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT }, structured: true },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  },
  {
    id: castId<ChatModelId>("claude-haiku-4-5-20251001"),
    tier: "haiku",
    label: "Haiku 4.5",
    capability: {
      reasoning: { mode: "none", enabled: false },
      sampling: {},
      input: { vision: true },
      tools: { parallel: true },
      output: { maxTokens: { min: MIN_OUTPUT, max: HAIKU_MAX_OUTPUT }, structured: true },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  },
] as const;

/** The Claude-family capability FLOOR, DERIVED from the table above (never a second hand-kept list): the
 *  axes EVERY curated entry declares. A Claude id the shortlist doesn't carry is a Claude NEWER than every
 *  entry here, and Claude capability does not regress across versions — so what all of these do, it does.
 *  The uncurated-Claude fallbacks (`resolve-agent-sdk-alias`, the OR synthesis in `resolve-model-capability`)
 *  read this instead of synthesizing a flagless profile; without it a brand-new Claude resolved as
 *  tool-less + structured-output-less (newer read as LESS capable), which is exactly what makes an rpg game
 *  on it fall back to trackers-readonly (`domain/rpg/substrate/readonly-axis`). Applies to RECOGNIZED
 *  Claude ids only (`detectModelFamily(id) === "anthropic"`); an unrecognized id claims nothing. */
export const CLAUDE_CAPABILITY_FLOOR = {
  parallelTools: CHAT_MODELS.every((entry) => entry.capability.tools?.parallel === true),
  structuredOutput: CHAT_MODELS.every((entry) => entry.capability.output.structured === true),
  vision: CHAT_MODELS.every((entry) => entry.capability.input?.vision === true),
} as const;

/** Brand guard — is `id` a curated Claude-shortlist id? */
export function isChatModelId(id: string): id is ChatModelId {
  return CHAT_MODELS.some((entry) => entry.id === id);
}

/** The 3-stage prefix-match lookup; `undefined` → not curated (caller synthesizes instead). */
export function getChatModel(id: ModelId | string): CuratedChatModel | undefined {
  // Stage 1 — exact curated id.
  const direct = CHAT_MODELS.find((entry) => entry.id === id);
  if (direct !== undefined) {
    return direct;
  }
  // Stage 2 — strip an `anthropic/` (or any) prefix + normalize OR's dotted version to the dashed form.
  const slash = id.indexOf("/");
  const stripped = slash >= 0 ? id.slice(slash + 1) : id;
  const normalized = stripped.replace(/\./g, "-");
  const exact = CHAT_MODELS.find((entry) => entry.id === normalized);
  if (exact !== undefined) {
    return exact;
  }
  // Stage 3 — prefix match WITH the boundary check (next char after the version must be `-`), so
  // `claude-haiku-4-5` → `claude-haiku-4-5-20251001` but `claude-haiku-4` does NOT match `…-45-…`.
  return CHAT_MODELS.find((entry) => entry.id === normalized || entry.id.startsWith(`${normalized}-`));
}

/** Detect the tier of a bare family alias or a Claude id containing the tier token; `undefined` for a
 *  non-Claude id or a fork whose id merely contains "claude". */
export function detectChatModelTier(id: string): "opus" | "sonnet" | "haiku" | undefined {
  const bare = id.trim().toLowerCase();
  if (bare === "opus" || bare === "sonnet" || bare === "haiku") {
    return bare;
  }
  const match = CLAUDE_TIER_RE.exec(id);
  const tier = match?.groups?.["tier"];
  return tier === undefined ? undefined : (tier.toLowerCase() as "opus" | "sonnet" | "haiku");
}

/** The curated FLAGSHIP entry for a tier — the FIRST CHAT_MODELS entry per tier. A tier may carry
 *  additional curated entries (claude-sonnet-4-6, curated for its structured flag — c656bc1b); list
 *  order is load-bearing: the flagship precedes them. */
export function chatModelForTier(tier: "opus" | "sonnet" | "haiku"): CuratedChatModel {
  const entry = CHAT_MODELS.find((candidate) => candidate.tier === tier);
  if (entry === undefined) {
    throw new Error(`no curated shortlist entry for tier "${tier}"`);
  }
  return entry;
}
