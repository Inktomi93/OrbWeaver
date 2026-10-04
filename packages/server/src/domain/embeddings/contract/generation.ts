import type { EmbedGenerationId } from "@orb/kit/ids";

export type GenerationTask = "embed" | "imageEmbed";

/** A target move refused before it purged anything: the new encoder does not make the width its connection states, or
 *  did not answer the probe that would tell. */
export type EmbedMoveRefusal =
  | { readonly kind: "width"; readonly task: GenerationTask; readonly stated: number; readonly measured: number; readonly truncatable: boolean }
  | { readonly kind: "unreachable"; readonly task: GenerationTask };

export interface GenerationReceipt {
  readonly id: EmbedGenerationId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly epoch: number;
  readonly space: string;
}
