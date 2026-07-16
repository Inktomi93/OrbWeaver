// Maps a bare family alias (sonnet/opus/haiku) or a stale curated/version id onto the daemon's current
// `resolvedModel` + a `ModelCapability` derived from the daemon's own flags, so an agent never pins a stale
// version. Pure (cached rows passed in); `undefined` ⇒ no daemon row covers the id.

import type { AgentSdkModel, ModelCapability } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import type { AgentSdkAliasResolution } from "../contract/results";
import { getChatModel } from "./chat-models";

const CLAUDE_CONTEXT_WINDOW = 200_000;
const CLAUDE_MAX_OUTPUT = 64_000;
const MIN_OUTPUT = 1;
const CLAUDE_DISPLAY_MODES = ["summarized", "omitted"] as const;

/** Find the daemon row covering `model` — by alias or by an already-resolved version id. */
function findRow(model: string, cached: readonly AgentSdkModel[]): AgentSdkModel | undefined {
  return cached.find((row) => row.alias === model || row.resolvedModel === model);
}

/** Adaptive thinking wins the `mode`; otherwise effort mode with the daemon's own levels; else no reasoning. */
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

/** Resolve a bare family alias / stale id via the daemon's live map; `undefined` when no daemon row covers it. */
export function resolveAgentSdkAlias(model: ModelId | string, cached: readonly AgentSdkModel[] | null): AgentSdkAliasResolution | undefined {
  if (cached === null) {
    return;
  }
  const row = findRow(model, cached);
  if (row === undefined || row.resolvedModel === null) {
    return;
  }
  // Output/context bounds: prefer the curated entry for the resolved id; else the Claude-family default.
  const curated = getChatModel(row.resolvedModel);
  const output = curated === undefined ? { maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT } } : curated.capability.output;
  const context = curated === undefined ? { window: CLAUDE_CONTEXT_WINDOW, supports1M: false } : curated.capability.context;
  return {
    resolvedModel: row.resolvedModel,
    capability: {
      reasoning: reasoningFromDaemon(row),
      sampling: {}, // agent-sdk honors no sampling knob
      output,
      context,
    },
  };
}
