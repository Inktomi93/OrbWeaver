// What a generated picture's provider call spent, as the lightbox's provenance strip words it: token counts and cache
// economics, each only when the provider reported it. An unreported axis is absent, never a zero.

import type { GenerationUsageDetails } from "@orb/contracts/inference";
import { cacheTokensLabel } from "#lib";

export function provenanceUsageLabels(usage: GenerationUsageDetails): readonly string[] {
  const labels: string[] = [];
  if (usage.tokensIn !== null) {
    labels.push(`${usage.tokensIn} tokens in`);
  }
  if (usage.tokensOut !== null) {
    labels.push(`${usage.tokensOut} tokens out`);
  }
  if (usage.reasoningTokens !== null && usage.reasoningTokens > 0) {
    labels.push(`${usage.reasoningTokens} reasoning tokens`);
  }
  const cache = cacheTokensLabel(usage.cacheReadTokens, usage.cacheWriteTokens);
  if (cache !== null) {
    labels.push(cache);
  }
  return labels;
}
