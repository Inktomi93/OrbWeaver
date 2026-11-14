import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

/**
 * The one "newest first" order of an owner's personas. The id breaks a tie in `createdAt` (ids sort by their mint time), so the list a
 * client shows and the persona a deleted default moves to cannot disagree about who is first.
 */
export const NEWEST_PERSONA_FIRST = [desc(personas.createdAt), desc(personas.id)] as const;

/** Read the owner's newest persona other than `excluding`, the one a delete is about to remove. */
export async function loadNewestPersonaId(db: Db, ownerId: UserId, excluding: PersonaId): Promise<PersonaId | null> {
  const [newest] = await db
    .select({ id: personas.id })
    .from(personas)
    .where(and(eq(personas.ownerId, ownerId), ne(personas.id, excluding)))
    .orderBy(...NEWEST_PERSONA_FIRST)
    .limit(1);
  return newest?.id ?? null;
}

/** Of `ids`, the ones the owner still holds. */
export async function loadHeldPersonaIds(db: Db, ownerId: UserId, ids: readonly PersonaId[]): Promise<ReadonlySet<PersonaId>> {
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ id: personas.id })
    .from(personas)
    .where(and(eq(personas.ownerId, ownerId), inArray(personas.id, [...ids])));
  return new Set(rows.map((row) => row.id));
}
