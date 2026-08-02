// verb: attachToCharacter — attach an owned book to an owned character at `role`. Gates BOTH sides: the
// character (`ensureCharacterOwned` — a sanctioned `characters` schema read) AND the book (`loadOwnedBook`).
// D28: `character_books` keys on `characters.id` (live identity — no version table).
//
// THE PRIMARY-UNIQUENESS BELT (invariant #3): `role:'primary'` MUST run a SINGLE atomic
// `db.batch([demote, upsert])`. The `demote` flips any OTHER book currently primary on this character to
// auxiliary; `ne(worldBookId, bookId)` excludes the row the upsert touches, so the two statements hit
// DISJOINT rows (order is immaterial) — but ATOMICITY is not: split into two sequential awaits, a concurrent
// attach could leave two primaries or a crash between them zero. Do NOT split it.

import { characterBooks } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { and, eq, ne } from "drizzle-orm";
import type { WorldInfoContext } from "../../context";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { AttachToCharacterParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { ensureCharacterOwned } from "../../persistence/ownership";
import { loadOwnedBook } from "../../persistence/queries";

const PRIMARY_ROLE = "primary";

export function createAttachToCharacter(ctx: WorldInfoContext): WorldInfoService["attachToCharacter"] {
  return async ({ principal, characterId, bookId, role }: AttachToCharacterParams) => {
    const ownerId = principal.userId;
    const [, book] = await Promise.all([ensureCharacterOwned(ctx.db, ownerId, characterId), loadOwnedBook(ctx.db, ownerId, bookId)]);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const at = ctx.now();
    const upsert = ctx.db
      .insert(characterBooks)
      .values({ characterId, worldBookId: bookId, role, createdAt: at })
      .onConflictDoUpdate({
        target: [characterBooks.characterId, characterBooks.worldBookId],
        set: { role },
      });

    if (role === PRIMARY_ROLE) {
      const demote = ctx.db
        .update(characterBooks)
        .set({ role: "auxiliary" })
        .where(and(eq(characterBooks.characterId, characterId), eq(characterBooks.role, PRIMARY_ROLE), ne(characterBooks.worldBookId, bookId)));
      await ctx.db.batch(batchMany([demote, upsert]));
    } else {
      await upsert;
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.attachToCharacter",
        entityType: "world_book",
        entityId: bookId,
        metadata: { characterId, role },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
  };
}
