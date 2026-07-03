// domain/connection/catalog/chat-models — the curated Claude shortlist (the catalog `connection` selects
// FROM for the agent-sdk + Claude-via-OR paths). Migrated from neo-tavern's
// `providers/_shared/chat-models.ts`; the `ChatModel` precursor is DISSOLVED — each entry now carries its
// `ModelCapability` directly (the ONE descriptor), so there is no second capability
// system. `DEFAULT_CHAT_MODEL_ID`/`ChatModelId` live in `@orb/contracts/connection` (PD-10) and are
// imported DOWN here; the opus entry's id IS `DEFAULT_CHAT_MODEL_ID` (one home for the literal).
//
// LOAD-BEARING — `getChatModel`'s 3-stage prefix-match (providers.md Esoteric
// §6): OpenRouter uses version-only ids (`claude-haiku-4-5`) while the curated catalog uses the dated form
// (`claude-haiku-4-5-20251001`). Stage 3 prefix-matches with a boundary check (the next char after the
// version must be `-`) so `claude-haiku-4-5` resolves to the dated entry, but `claude-haiku-4` does NOT
// match `claude-haiku-45-…`. Simplifying to exact-match silently falls Haiku through to synthesis with the
// wrong profile (wrong effortLevels / no adaptive). The 3 stages move TOGETHER, boundary check intact.

import type { ChatModelId, ModelCapability } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// Curated numeric facts (named — noMagicNumbers). DEFER(promotion): the exact reasoning effortLevels +
// max-output numbers are the "quality → axes mapping" deferred item (proposed/connection-capability-panel.md)
// — fixed when the shortlist is verified against live model behaviour. The SHAPE (distinct axes,
// adaptive on opus, no sampling on agent-sdk) is settled; only the numbers are tunable.
const CLAUDE_CONTEXT_WINDOW = 200_000;
const CLAUDE_MAX_OUTPUT = 64_000;
const HAIKU_MAX_OUTPUT = 8192;
const MIN_OUTPUT = 1;

/** The opus/sonnet reasoning display knobs (Anthropic-only — summarized thinking or omitted). */
const CLAUDE_DISPLAY_MODES = ["summarized", "omitted"] as const;

/** A curated shortlist entry. File-local (non-exported): the cross-boundary descriptor is
 *  `ModelCapability` (@orb/contracts); the entry just pairs a branded id + tier/label with it. `sampling`
 *  is `{}` for every entry — these run on `agent-sdk`, which honors NO sampling knob (the panel shows no
 *  sampling for agent-sdk); the sampling axes are synthesized for OR/vLLM, not curated here. */
interface CuratedChatModel {
  readonly id: ChatModelId;
  /** Coarse family tier (label/grouping only — not load-bearing for selection). */
  readonly tier: "opus" | "sonnet" | "haiku";
  readonly label: string;
  readonly capability: ModelCapability;
}

export const CHAT_MODELS: readonly CuratedChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL_ID, // "claude-opus-4-8" — the one home for the literal (contracts, PD-10)
    tier: "opus",
    label: "Opus 4.8",
    capability: {
      // Opus 4.8 reasons ADAPTIVELY (providers.md Esoteric §8): the infra
      // funnel reads `mode === 'adaptive'` and DROPS budget_tokens (sending type:'enabled' + budget → 400).
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        displayModes: [...CLAUDE_DISPLAY_MODES],
      },
      sampling: {},
      output: { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT } },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: true },
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
        effortLevels: ["low", "medium", "high", "max"],
        displayModes: [...CLAUDE_DISPLAY_MODES],
      },
      sampling: {},
      output: { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT } },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  },
  {
    // Dated id — Stage 3 of getChatModel maps the OR version-only `claude-haiku-4-5` onto this entry.
    id: castId<ChatModelId>("claude-haiku-4-5-20251001"),
    tier: "haiku",
    label: "Haiku 4.5",
    capability: {
      reasoning: { mode: "none", enabled: false },
      sampling: {},
      output: { maxTokens: { min: MIN_OUTPUT, max: HAIKU_MAX_OUTPUT } },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  },
] as const;

/** Brand guard — is `id` a curated Claude-shortlist id? The discriminator `pickOrModel` guard (1) uses to
 *  reject a shortlist id on the OR path (it is agent-sdk-only) and the agent-sdk heal uses to keep a valid
 *  id. A `true` result narrows to the branded {@link ChatModelId}. */
export function isChatModelId(id: string): id is ChatModelId {
  return CHAT_MODELS.some((entry) => entry.id === id);
}

/**
 * The 3-stage prefix-match lookup (LOAD-BEARING — file header). Returns the curated entry for an id in any
 * of: exact curated id · OR-normalized id (slash-stripped + dots→dashes) · version-only prefix of a dated
 * id (boundary-checked so a shorter version can't match a longer one). `undefined` → not curated (the
 * caller synthesizes the descriptor from the OR catalog / family instead).
 */
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
  return CHAT_MODELS.find(
    (entry) => entry.id === normalized || entry.id.startsWith(`${normalized}-`),
  );
}
