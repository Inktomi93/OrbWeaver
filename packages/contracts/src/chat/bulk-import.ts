// @orb/contracts/chat/bulk-import — the chat-OWNED bulk-import op input (Option B; D34). `import` maps its ST
// parse (`ParsedChat`, which stays import-owned) onto these CANONICAL chat shapes and calls `chat`'s
// `createBulkImportChats` op; the chat op learns nothing about SillyTavern. Persona attribution is
// pre-resolved to ids by import (so the op is persona-agnostic). A cross-boundary shape shared by import +
// chat → contracts (D34).

import type { PersonaId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** One resolved variant (swipe) row for a bulk-imported message (D26 — the SELECTED variant carries the
 *  rendered content). `idx` is 0-based within the slot's pool; the economics subset is what an ST import
 *  carries (the rest of `message_variants` stays null). */
export interface BulkImportVariantInput {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly ttftMs: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly metadata: Record<string, unknown> | null;
}

/** One resolved message slot for a bulk-imported chat. Attribution is SLOT-level (D26): the chat op stamps
 *  `authorUserId` (user turns) / `characterId` (assistant turns) itself from the run's owner/character;
 *  `personaId` is pre-resolved by import (the persona the user RP'd as, or null). `selectedIdx` selects the
 *  rendered variant out of `variants`. */
export interface BulkImportMessageInput {
  readonly role: MessageRole;
  readonly createdAt: number;
  readonly personaId: PersonaId | null;
  readonly variants: readonly BulkImportVariantInput[];
  readonly selectedIdx: number;
}

/** One resolved chat to bulk-import into an existing character. The SUPERSET shape — every field
 *  `export/verbs/export-chat.ts` round-trips out of the db, so an orbweaver export re-imports losslessly
 *  (plain ST is the lossy subset: orb-only fields arrive empty). `importHash` is the per-chat dedup oracle
 *  (`chats.importHash`); `updatedAt` is the ST last-activity (import computes `Math.max(send_dates)`, not
 *  `now`); `parentRef` is the branch parent's source filename (resolved character-wide by the op);
 *  `authorsNote` is the ST `note_prompt` → `chats.metadata.roomOverrides.authorsNote` (the typed home export
 *  reads back); `isRealConversation` gates the memory-backfill enqueue (PD-78). */
export interface BulkImportChatInput {
  readonly title: string;
  readonly importedFrom: string;
  readonly importHash: string;
  readonly anchorPersonaId: PersonaId | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly parentRef: string | null;
  readonly authorsNote: string | null;
  readonly isRealConversation: boolean;
  readonly messages: readonly BulkImportMessageInput[];
}

/** The tallies `createBulkImportChats` returns for one bulk-import run. `realConversationWritten` is the
 *  PD-78 backfill gate (import enqueues ONE `memory-backfill` when true). */
export interface BulkImportChatsResult {
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly realConversationWritten: boolean;
}
