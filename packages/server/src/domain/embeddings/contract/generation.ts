import type { EmbeddingConnectionSnapshot } from "./service.ts";

export type GenerationTask = "embed" | "imageEmbed";

export interface GenerationReceipt {
  readonly id: string;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly epoch: number;
  readonly space: string;
}

export interface PinnedGeneration extends GenerationReceipt {
  readonly connection: EmbeddingConnectionSnapshot;
}
