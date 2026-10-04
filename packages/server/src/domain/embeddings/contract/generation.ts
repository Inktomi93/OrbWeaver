import type { EmbedGenerationId } from "@orb/kit/ids";

export type GenerationTask = "embed" | "imageEmbed";

/** A target move refused before it purged anything: the new encoder does not make the width its connection states. */
export interface EmbedWidthRefusal {
  readonly task: GenerationTask;
  readonly stated: number;
  readonly measured: number;
}

export interface GenerationReceipt {
  readonly id: EmbedGenerationId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly epoch: number;
  readonly space: string;
}
