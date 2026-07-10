// domain/connection/catalog/resolve-agent-sdk-alias — the family→version fix. The agent-sdk daemon owns
// the authoritative alias→version map (`sonnet` → `claude-sonnet-5`) + the reasoning-capability flags it
// reports from `supportedModels()`. This resolver maps a BARE family alias (`sonnet`/`opus`/`haiku`) or a
// stale curated/version id onto the daemon's CURRENT `resolvedModel` + a `ModelCapability` derived from the
// daemon's own flags — so an agent never pins a stale version, and the answer is DAEMON-owned so it is
// identical for the Max sub AND the OR-Anthropic skin (both ride the same daemon).
//
// PURE: the cached daemon rows are passed in (the caller read them with `ctx.now()`), so this is
// deterministic + unit-testable. `undefined` ⇒ no daemon row covers the id (cold cache / unknown alias);
// the caller falls back to the curated shortlist / static profile (never a fabricated capability).
//
// The daemon reports reasoning flags but NOT output/context bounds; those come from the curated shortlist
// entry for the resolved id (the 3-stage `getChatModel` match), or a conservative default when the daemon
// surfaces a version the shortlist doesn't yet curate.

import type { AgentSdkModel, ModelCapability } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import type { AgentSdkAliasResolution } from "../contract/results";
import { getChatModel } from "./chat-models";

// Named bounds (noMagicNumbers) — the fallback when the daemon resolves a version the curated shortlist
// doesn't cover. Claude-family facts (the shortlist's own CLAUDE_* constants); a resolved Claude version is
// always 200k-window / 64k-output-class.
const CLAUDE_CONTEXT_WINDOW = 200_000;
const CLAUDE_MAX_OUTPUT = 64_000;
const MIN_OUTPUT = 1;
const CLAUDE_DISPLAY_MODES = ["summarized", "omitted"] as const;

/** Find the daemon row covering `model` — by alias (`sonnet`) OR by an already-resolved version id
 *  (`claude-sonnet-5`), so both a bare family alias and the current wire id map to the same row. */
function findRow(model: string, cached: readonly AgentSdkModel[]): AgentSdkModel | undefined {
  return cached.find((row) => row.alias === model || row.resolvedModel === model);
}

/** Build the reasoning axis from the daemon's flags. Adaptive thinking wins the `mode` (Opus-class);
 *  otherwise effort mode with the daemon's own levels; else no reasoning. `enabled` is its own axis. */
function reasoningFromDaemon(row: AgentSdkModel): ModelCapability["reasoning"] {
  if (row.supportsAdaptiveThinking) {
    return {
      mode: "adaptive",
      enabled: true,
      ...(row.effortLevels.length > 0 ? { effortLevels: [...row.effortLevels] } : {}),
      displayModes: [...CLAUDE_DISPLAY_MODES],
    };
  }
  if (row.supportsEffort && row.effortLevels.length > 0) {
    return {
      mode: "effort",
      enabled: true,
      effortLevels: [...row.effortLevels],
      displayModes: [...CLAUDE_DISPLAY_MODES],
    };
  }
  return { mode: "none", enabled: false };
}

/**
 * Resolve a bare family alias / stale id via the daemon's live map. Returns the daemon's current
 * `resolvedModel` + a `ModelCapability` whose reasoning axis is the daemon's reported flags and whose
 * output/context bounds come from the curated shortlist entry for the resolved id (or the Claude-family
 * default when the daemon surfaces an un-curated version). `undefined` when no daemon row covers the id.
 */
export function resolveAgentSdkAlias(
  model: ModelId | string,
  cached: readonly AgentSdkModel[] | null,
): AgentSdkAliasResolution | undefined {
  if (cached === null) {
    return;
  }
  const row = findRow(model, cached);
  if (row === undefined || row.resolvedModel === null) {
    return;
  }
  // Output/context bounds: prefer the curated entry for the resolved id; else the Claude-family default.
  // biome's noUnnecessaryConditions under-resolves the cross-package `getChatModel` return (`| undefined`)
  // and false-flags the `?.` — the CLAUDE_* fallback is reachable when the daemon surfaces an un-curated
  // version, so the chaining is load-bearing (same z.infer under-resolution translate.ts documents).
  const curated = getChatModel(row.resolvedModel);
  const output =
    curated === undefined
      ? { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT } }
      : curated.capability.output;
  const context =
    curated === undefined
      ? { window: CLAUDE_CONTEXT_WINDOW, supports1M: false }
      : curated.capability.context;
  return {
    resolvedModel: row.resolvedModel,
    capability: {
      reasoning: reasoningFromDaemon(row),
      // agent-sdk honors NO sampling knob (the shortlist's `sampling: {}` invariant — chat-models.ts).
      sampling: {},
      output,
      context,
    },
  };
}
