import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";

/** Read the owner's newest remaining persona after deletion. */
export async function loadNewestPersonaId(db: Db, ownerId: UserId): Promise<PersonaId | null> {
  const [newest] = await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, ownerId)).orderBy(desc(personas.createdAt)).limit(1);
  return newest?.id ?? null;
}
