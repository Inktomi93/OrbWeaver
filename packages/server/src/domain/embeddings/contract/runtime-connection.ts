import type { InferenceRuntime } from "@orb/inference";

export interface EmbeddingRuntime {
  readonly resolve: InferenceRuntime["resolve"];
  readonly funnel: Pick<InferenceRuntime["funnel"], "embed">;
  readonly executor: Pick<InferenceRuntime["executor"], "embed" | "imageEmbed">;
  readonly embeddingExecution: InferenceRuntime["embeddingExecution"];
}
