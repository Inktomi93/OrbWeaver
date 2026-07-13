// domain/import/contract/results — the verb result shapes.

import type { CharacterId, PersonaId } from "@orb/kit/ids";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** created:false means an existing character already carried this importHash — nothing was written. */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
}

/** backfillEnqueued: whether the run enqueued a memory-backfill (only when ≥1 real_conversation chat was written). */
export interface ImportChatsResult {
  readonly characterId: CharacterId;
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly backfillEnqueued: boolean;
}

export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
}
