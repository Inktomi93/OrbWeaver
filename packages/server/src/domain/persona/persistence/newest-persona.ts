import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";

/**
 * The one "newest first" order of an owner's personas. The id breaks a tie in `createdAt` (ids sort by their mint time), so the list a
 * client shows and the persona a deleted default moves to cannot disagree about who is first.
 */
export const NEWEST_PERSONA_FIRST = [desc(personas.createdAt), desc(personas.id)] as const;

/** Read the owner's newest remaining persona after deletion. */
export async function loadNewestPersonaId(db: Db, ownerId: UserId): Promise<PersonaId | null> {
  const [newest] = await db
    .select({ id: personas.id })
    .from(personas)
    .where(eq(personas.ownerId, ownerId))
    .orderBy(...NEWEST_PERSONA_FIRST)
    .limit(1);
  return newest?.id ?? null;
}
