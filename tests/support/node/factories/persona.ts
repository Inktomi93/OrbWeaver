// Persona seeds run the production verbs and return their outcomes; rows-tier twins in `rows/persona.ts` read the rows.

import type { personas } from "@orb/db";
import type { PersonaService } from "@orb/server/domain/persona";
import type { ServerProducerRoot } from "../server.ts";

export type PersonaRow = typeof personas.$inferSelect;

export interface SeededPersona {
  readonly view: Awaited<ReturnType<PersonaService["create"]>>;
}

/** Run the owner's creation; the metadata write and avatar-joined view stay production's. */
export async function seedPersona(root: ServerProducerRoot, params: Parameters<PersonaService["create"]>[0]): Promise<SeededPersona> {
  return { view: await root.services.persona.create(params) };
}
