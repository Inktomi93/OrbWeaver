// The ADVERTISED tier from the daemon's `supportedModels()` row: the reasoning axis only (adaptive wins the
// mode; else effort with the daemon's own levels; else none). The daemon is silent about tools / structured /
// modalities — those come from the curated Claude rows and the family floor. `sampling` is EMPTY on this
// wire (the runtime exposes no sampler knob): every preset knob drops with `sampling_knob_dropped`.

import type { AgentSdkModel, GenerationCapability, ReasoningCapability } from "@orb/contracts/inference";

const CLAUDE_DISPLAY_MODES = ["summarized", "omitted"] as const;

function reasoningFromDaemon(row: AgentSdkModel): ReasoningCapability {
  if (row.supportsAdaptiveThinking) {
    return {
      mode: "adaptive",
      enabled: true,
      ...(row.effortLevels.length > 0 ? { effortLevels: [...row.effortLevels] } : {}),
      displayModes: [...CLAUDE_DISPLAY_MODES],
    };
  }
  if (row.supportsEffort && row.effortLevels.length > 0) {
    return { mode: "effort", enabled: true, effortLevels: [...row.effortLevels], displayModes: [...CLAUDE_DISPLAY_MODES] };
  }
  return { mode: "none", enabled: false };
}

export function advertisedFromAgentSdk(row: AgentSdkModel): Partial<GenerationCapability> {
  return { reasoning: reasoningFromDaemon(row), sampling: {} };
}

/** Find the daemon row covering `model` — by alias or by an already-resolved version id. A row whose
 *  `resolvedModel` is null names no wire id and cannot resolve (falling through would pin the alias). */
export function agentSdkRowFor(model: string, rows: readonly AgentSdkModel[] | null): AgentSdkModel | undefined {
  if (rows === null) {
    return;
  }
  const row = rows.find((candidate) => candidate.alias === model || candidate.resolvedModel === model);
  return row !== undefined && row.resolvedModel !== null ? row : undefined;
}
