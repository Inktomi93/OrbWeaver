// Card write data crosses the admin→embeddings consumer boundary; cancellation stays in the server owner.

import type { CharacterId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import type { EmbeddingTask } from "./accounting.ts";

/** Embed a character card's text. Unique key: `(characterId, model)`; `ownerId` funds its vector space. */
export interface CardTextStoreInput {
  readonly kind: "card";
  readonly lens: "card-text";
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly content: string;
  readonly model: string;
  /** Re-embed even when the stored `content_hash` matches. */
  readonly force?: boolean | undefined;
}

/** noop = content_hash unchanged, no re-embed/write happened; written = a fresh insert or hash-changed update landed. */
export interface StoreResult {
  readonly outcome: "noop" | "written";
  readonly contentHash: string;
  /** The concrete space of the row that satisfied this write (provider-stamped for a write). */
  readonly model: string;
  /** Immutable encoder generation that satisfied this write/noop. Sweep terminals use it as their receipt. */
  readonly generationId?: EmbedGenerationId;
  readonly generationEpoch?: number;
  readonly generationVia?: EmbeddingTask;
}
