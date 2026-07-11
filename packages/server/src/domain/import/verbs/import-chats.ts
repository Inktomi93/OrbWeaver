// verb: importChats (PD-77) — attach a list of loose ST chat `.jsonl` files to an EXISTING owned character
// (chosen explicitly — ST chat headers don't reliably carry the character name, so there's no safe auto-
// match for a loose file). Verifies ownership, writes chats→messages→variants + roster + branch links via
// the chat-writer, then enqueues ONE `memory-backfill` when any `real_conversation` chat was written (the
// PD-78 gate: no canon-write path leaves the downstream index un-run).
//
// Writes/reads against `@orb/db` DIRECTLY (the bulk-serializer exemption, RULING A) via `ctx.profile`. The
// ownership gate is a direct owner-scoped `characters` read (the same exemption export's reads use); a
// missing / non-owned character throws the shared `DomainNotFoundError` (`@orb/kit/errors`).

import { characters } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { and, eq } from "drizzle-orm";
import type { ImportChatsResult } from "../contract/results";
import type { ImportContext, ImportService } from "../contract/service";
import type { ImportChatsInput } from "../contract/views";
import { requireProfile } from "../guard";
import { writeImportedChats } from "../persistence/chat-writer";

export function createImportChats(ctx: ImportContext): ImportService["importChats"] {
  return async (input: ImportChatsInput): Promise<ImportChatsResult> => {
    const profile = requireProfile(ctx);
    const ownerId = ctx.ownerId;

    const owned = await profile.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.id, input.characterId), eq(characters.ownerId, ownerId)))
      .limit(1);
    if (owned[0] === undefined) {
      throw new DomainNotFoundError("character", input.characterId);
    }

    const counts = await writeImportedChats(profile, {
      ownerId,
      characterId: input.characterId,
      chats: input.chats,
    });

    // PD-78: ONE memory-backfill per run, ONLY when a real_conversation chat was written (the gate invariant
    // — a chat canon-write always enqueues the downstream index sweep). Reuses `character.updated` semantics
    // via the workload; no `import.completed` event.
    if (counts.realConversationWritten) {
      await profile.enqueueBackfill({ ownerId });
    }

    return {
      characterId: input.characterId,
      chatsImported: counts.chatsImported,
      chatsSkipped: counts.chatsSkipped,
      messagesImported: counts.messagesImported,
      variantsImported: counts.variantsImported,
      branchesLinked: counts.branchesLinked,
      backfillEnqueued: counts.realConversationWritten,
    };
  };
}
