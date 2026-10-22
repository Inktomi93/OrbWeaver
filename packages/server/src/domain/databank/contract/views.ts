// Persistence-only attachment rows retain unresolved room ids; canonical wire views live in contracts.

import type { DocumentCharacterRef } from "@orb/contracts/databank";
import type { ChatId } from "@orb/kit/ids";

/** What the persistence read can answer ALONE — the view minus the room resolution. The chat ids stay ids
 *  here because whether the caller may see them is chat's question, injected at the verb. */
export interface DocumentAttachmentRows {
  readonly global: boolean;
  readonly chatIds: readonly ChatId[];
  readonly characters: readonly DocumentCharacterRef[];
}
