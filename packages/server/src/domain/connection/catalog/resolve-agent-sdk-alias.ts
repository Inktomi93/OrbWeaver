// Maps a bare family alias (sonnet/opus/haiku) or a stale curated/version id onto the daemon's current
// `resolvedModel` + a `ModelCapability` derived from the daemon's own flags, so an agent never pins a stale
// version. The axes the daemon is silent about (tools / structured output / vision) come from the curated
// entry for the resolved version, else the `CLAUDE_CAPABILITY_FLOOR`.
// Pure (cached rows passed in); `undefined` ⇒ no daemon row covers the id.

import type { AgentSdkModel, ModelCapability } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import type { AgentSdkAliasResolution } from "../contract/results";
import { CLAUDE_CAPABILITY_FLOOR, getChatModel } from "./chat-models";
import { detectModelFamily } from "./model-family";

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
  // `resolvedModel` is OPTIONAL on the SDK's own `ModelInfo` (normalized to null in providers/…/agent-sdk/
  // catalog.ts), so a daemon row that names no wire id is a real wire shape — it can't be resolved, and
  // falling through would pin the alias itself as a model id.
  if (row === undefined || row.resolvedModel === null) {
    return;
  }
  // Bounds + the daemon-silent axes: prefer the curated entry for the resolved id; else the Claude family.
  // BOTH arms are live, though the caller's shape hides it: `resolveModelCapability` only reaches here after
  // `getChatModel(model)` MISSED, so a row matched by its `resolvedModel` (model === row.resolvedModel) always
  // takes the default arm, while a row matched by ALIAS ("sonnet" — never a curated id) hits the curated arm
  // whenever the daemon's current version is one we curate.
  const curated = getChatModel(row.resolvedModel);
  if (curated !== undefined) {
    return {
      resolvedModel: row.resolvedModel,
      capability: {
        reasoning: reasoningFromDaemon(row),
        sampling: {}, // agent-sdk honors no sampling knob
        ...(curated.capability.input !== undefined ? { input: curated.capability.input } : {}),
        ...(curated.capability.tools !== undefined ? { tools: curated.capability.tools } : {}),
        output: curated.capability.output,
        context: curated.capability.context,
      },
    };
  }
  // Uncurated resolved id ⇒ a Claude NEWER than the shortlist. The daemon advertises REASONING flags only, so
  // the axes it is silent about (tools / structured output / vision) come from the family FLOOR — the axes
  // every curated Claude declares — rather than a flagless profile: synthesizing a brand-new Claude as
  // tool-less + structured-output-less inverts reality (newer resolved as LESS capable) and silently drops an
  // rpg game on it to trackers-readonly. A resolved id the anthropic anchor does NOT recognize (a third-party
  // fork whose id merely contains "claude") is genuinely unrecognized and keeps the conservative synthesis.
  const claude = detectModelFamily(row.resolvedModel) === "anthropic";
  return {
    resolvedModel: row.resolvedModel,
    capability: {
      reasoning: reasoningFromDaemon(row),
      sampling: {},
      ...(claude && CLAUDE_CAPABILITY_FLOOR.vision ? { input: { vision: true } } : {}),
      ...(claude && CLAUDE_CAPABILITY_FLOOR.parallelTools ? { tools: { parallel: true } } : {}),
      output: {
        maxTokens: { min: MIN_OUTPUT, max: CLAUDE_MAX_OUTPUT },
        ...(claude && CLAUDE_CAPABILITY_FLOOR.structuredOutput ? { structured: true } : {}),
      },
      context: { window: CLAUDE_CONTEXT_WINDOW, supports1M: false },
    },
  };
}
