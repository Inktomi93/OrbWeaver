// Character seeds run the production verbs and return their outcomes; rows-tier twins in `rows/character.ts` read the rows.

import type { characterPersonas, characterSnapshots, characters } from "@orb/db";
import type { CharacterService } from "@orb/server/domain/character";
import type { ServerProducerRoot } from "../server.ts";

export type CharacterRow = typeof characters.$inferSelect;
export type CharacterSnapshotRow = typeof characterSnapshots.$inferSelect;
export type CharacterPersonaRow = typeof characterPersonas.$inferSelect;

export interface SeededCharacter {
  readonly view: Awaited<ReturnType<CharacterService["create"]>>;
}

/** Run the owner's creation; the writer owns card defaults, denorms and stamps, and the seed returns its view. */
export async function seedCharacter(root: ServerProducerRoot, params: Parameters<CharacterService["create"]>[0]): Promise<SeededCharacter> {
  return { view: await root.services.character.create(params) };
}

export interface SeededCharacterHistory {
  readonly ref: Awaited<ReturnType<CharacterService["snapshot"]>>;
  readonly row: CharacterSnapshotRow;
  readonly view: Awaited<ReturnType<CharacterService["getSnapshot"]>>;
  readonly summaries: Awaited<ReturnType<CharacterService["listSnapshots"]>>;
  readonly page: Awaited<ReturnType<CharacterService["list"]>>;
}
