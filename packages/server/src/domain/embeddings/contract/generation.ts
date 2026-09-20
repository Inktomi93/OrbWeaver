import type { EmbedGenerationId } from "@orb/kit/ids";

export type GenerationTask = "embed" | "imageEmbed";

export interface GenerationReceipt {
  readonly id: EmbedGenerationId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly epoch: number;
  readonly space: string;
}
