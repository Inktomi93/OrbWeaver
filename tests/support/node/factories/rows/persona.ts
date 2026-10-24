// Persona rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaService } from "@orb/server/domain/persona";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { PersonaRow } from "../persona.ts";

/** Macro inversion and source provenance belong to the actual character-derived persona writer. */
export async function seedPersonaFromCharacterRows(
  root: ServerProducerRoot,
  params: Parameters<PersonaService["createFromCharacter"]>[0],
): Promise<SeededPersonaRows> {
  const db = root.db;
  const createFromCharacter = root.services.persona.createFromCharacter;
  const view = await createFromCharacter(params);
  return await captureCreatedPersona(db, view, params.principal.userId);
}

async function captureCreatedPersona(db: Db, view: SeededPersonaRows["view"], ownerId: PersonaRow["ownerId"]): Promise<SeededPersonaRows> {
  const row = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, view.id), eq(personas.ownerId, ownerId)))
    .get();
  if (row === undefined) {
    throw new Error("production persona creation left no canonical owned row");
  }
  return { view, row };
}

export interface SeededPersonaRows {
  readonly view: Awaited<ReturnType<PersonaService["create"]>>;
  readonly row: PersonaRow;
}

/** Preserve the actual metadata write and avatar-joined view without reconstructing either projection. */
export async function seedPersonaRows(root: ServerProducerRoot, params: Parameters<PersonaService["create"]>[0]): Promise<SeededPersonaRows> {
  const db = root.db;
  const create = root.services.persona.create;
  const view = await create(params);
  return await captureCreatedPersona(db, view, params.principal.userId);
}
