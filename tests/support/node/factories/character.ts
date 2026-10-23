// Character seeds run the owner verbs; the writer owns card defaults, content hash, token denorm and stamps.

import type { Db } from "@orb/db";
import { characterPersonas, characterSnapshots, characters } from "@orb/db";
import type { CharacterService } from "@orb/server/domain/character";
import type { PersonaService } from "@orb/server/domain/persona";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type CharacterRow = typeof characters.$inferSelect;
export type CharacterSnapshotRow = typeof characterSnapshots.$inferSelect;
export type CharacterPersonaRow = typeof characterPersonas.$inferSelect;

export interface SeededCharacter {
  readonly view: Awaited<ReturnType<CharacterService["create"]>>;
  readonly row: CharacterRow;
}

/** The writer owns card defaults, denorms and stamps; its detail projection is not the complete row. */
export async function seedCharacter(root: ServerProducerRoot, params: Parameters<CharacterService["create"]>[0]): Promise<SeededCharacter> {
  const db = root.db;
  const create = root.services.character.create;
  const view = await create(params);
  const row = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, view.id), eq(characters.ownerId, params.principal.userId)))
    .get();
  if (row === undefined) {
    throw new Error("production character creation left no canonical owned row");
  }
  return { view, row };
}

/** The owner operation captures the live card; a fixture never assembles its own snapshot blob. */
export async function seedCharacterSnapshot(root: ServerProducerRoot, params: Parameters<CharacterService["snapshot"]>[0]): Promise<CharacterSnapshotRow> {
  const db = root.db;
  const snapshot = root.services.character.snapshot;
  return (await produceCharacterSnapshot(db, snapshot, params)).row;
}

export interface SeededCharacterHistory {
  readonly ref: Awaited<ReturnType<CharacterService["snapshot"]>>;
  readonly row: CharacterSnapshotRow;
  readonly view: Awaited<ReturnType<CharacterService["getSnapshot"]>>;
  readonly summaries: Awaited<ReturnType<CharacterService["listSnapshots"]>>;
  readonly page: Awaited<ReturnType<CharacterService["list"]>>;
}

/** History and library views remain real reads; the capture does not project them from the stored card. */
export async function seedCharacterHistory(
  root: ServerProducerRoot,
  params: Parameters<CharacterService["snapshot"]>[0],
  list: Omit<Parameters<CharacterService["list"]>[0], "principal"> = {},
): Promise<SeededCharacterHistory> {
  const db = root.db;
  const operations = root.services.character;
  const produced = await produceCharacterSnapshot(db, operations.snapshot, params);
  const [view, summaries, page] = await Promise.all([
    operations.getSnapshot({ principal: params.principal, characterId: params.characterId, snapshotId: produced.ref.id }),
    operations.listSnapshots({ principal: params.principal, characterId: params.characterId }),
    operations.list({ ...list, principal: params.principal }),
  ]);
  return { ...produced, view, summaries, page };
}

async function produceCharacterSnapshot(
  db: Db,
  snapshot: CharacterService["snapshot"],
  params: Parameters<CharacterService["snapshot"]>[0],
): Promise<Pick<SeededCharacterHistory, "ref" | "row">> {
  const ref = await snapshot(params);
  const row = await db.select().from(characterSnapshots).where(eq(characterSnapshots.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production character snapshot left no canonical history row");
  }
  return { ref, row };
}

/** Both real ownership gates run before capturing the junction's exact composite key. */
export async function seedCharacterPersona(
  root: ServerProducerRoot,
  params: Parameters<PersonaService["connectToCharacter"]>[0],
): Promise<CharacterPersonaRow> {
  const db = root.db;
  const connectToCharacter = root.services.persona.connectToCharacter;
  await connectToCharacter(params);
  const row = await db
    .select()
    .from(characterPersonas)
    .where(and(eq(characterPersonas.characterId, params.characterId), eq(characterPersonas.personaId, params.personaId)))
    .get();
  if (row === undefined) {
    throw new Error("production persona connection left no canonical character-persona row");
  }
  return row;
}
