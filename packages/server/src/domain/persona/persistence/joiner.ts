// D254 — a sign-up joiner's persona as one unexecuted statement for chat's signup batch. It inserts only where the
// statement before it in that batch changed a row (`changes() > 0`), so a refused signup leaves no persona behind.
// Positional over the declared column order of `personas`, like the sessions signup account insert.

import type { JoinerPersona } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

export function insertJoinerPersonaStatement(
  db: Db,
  row: { readonly id: PersonaId; readonly ownerId: UserId; readonly persona: JoinerPersona; readonly at: number },
): AwaitableBatchStmt<{ id: PersonaId }[]> {
  return db
    .insert(personas)
    .select(
      sql`select ${row.id}, ${row.ownerId}, ${row.persona.name}, null, ${row.persona.description}, 0, null, null, ${row.at}, ${row.at} where changes() > 0`,
    )
    .returning({ id: personas.id });
}
