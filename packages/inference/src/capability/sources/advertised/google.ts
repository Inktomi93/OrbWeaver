import type { CapabilityOverride, ModelCatalogEntry, SamplingCapability } from "@orb/contracts/inference";

/** Native discovery refines shared model facts, without inventing a second model table. */
export function advertisedFromGoogle(
  entry: Pick<ModelCatalogEntry, "contextLength" | "maxCompletionTokens" | "google">,
  curated: readonly CapabilityOverride[],
): NonNullable<CapabilityOverride["generation"]> {
  const knownSampling = curated.findLast((row) => row.generation?.sampling !== undefined)?.generation?.sampling ?? {};
  const { topK, topP, ...otherSampling } = knownSampling;
  const sampling: SamplingCapability = {
    ...otherSampling,
    ...(entry.google?.topK === undefined || topK === undefined ? {} : { topK }),
    ...(entry.google?.topP === undefined || topP === undefined ? {} : { topP }),
    ...(entry.google?.maxTemperature === undefined ? {} : { temperature: { min: 0, max: entry.google.maxTemperature } }),
  };
  return {
    ...(entry.contextLength === null ? {} : { context: { window: entry.contextLength } }),
    ...(entry.maxCompletionTokens === null || entry.maxCompletionTokens === undefined
      ? {}
      : { output: { maxTokens: { min: 1, max: entry.maxCompletionTokens } } }),
    ...(entry.google === undefined ? {} : { sampling }),
    ...(entry.google?.thinking === undefined
      ? {}
      : { reasoning: entry.google.thinking ? { enabled: true } : { mode: "none", enabled: false, mandatory: false, replay: "none" } }),
  };
}
