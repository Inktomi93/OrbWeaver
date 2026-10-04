import type { EmbedGenerationId } from "@orb/kit/ids";

export type GenerationTask = "embed" | "imageEmbed";

/** A target move refused before it purged anything: the new encoder does not make the width its connection states, did
 *  not answer the probe that would tell, or refused the row's key. `assumed`: no width was stated, so `stated` is the
 *  one assumed for the model. */
export type EmbedMoveRefusal =
  | {
      readonly kind: "width";
      readonly task: GenerationTask;
      readonly stated: number;
      readonly measured: number;
      readonly truncatable: boolean;
      readonly assumed: boolean;
    }
  | { readonly kind: "unreachable"; readonly task: GenerationTask }
  | { readonly kind: "auth"; readonly task: GenerationTask };

export interface GenerationReceipt {
  readonly id: EmbedGenerationId;
  readonly task: GenerationTask;
  readonly via: GenerationTask;
  readonly epoch: number;
  readonly space: string;
}
