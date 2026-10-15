// support/factories/character — the flat `characters` card row (D28: no version table; the card IS the
// row). `X` is the SELECT row so defaults are fully-valid + complete (always-a-list columns default `[]`,
// never null — the parseStringArray asymmetry). Relations are ids by default: `makeCharacter` mints a
// dangling `ownerId` (pure — no db); `seedCharacter` makes the FK real, auto-seeding an owner user when
// the caller didn't hand one in (the neo FK-chain lesson, minus the dead version tier).

import type { Db } from "@orb/db";
import { characterPersonas, characterSnapshots, characters } from "@orb/db";
import type { CharacterHandle, IdSource, UserId } from "@orb/kit/ids";
import { castId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import type { CharacterService } from "@orb/server/domain/character";
import { cardTokenSize } from "@orb/server/domain/character";
import type { PersonaService } from "@orb/server/domain/persona";
// The card identity hash's ONE home — `@orb/server/primitives` is the server-only-PURE bottom tier
// (`.dependency-cruiser.cjs`: node:* + db + contracts + kit, reaching up to nothing), so importing it
// downward from a factory pulls `node:crypto` and two contracts, never a domain graph. D9 names this
// subpath family canonical and 19 of them are already imported across `tests/legacy/server/**`.
import { cardContentHash } from "@orb/server/primitives/serde/card";
import { and, eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { seedUser } from "./user.ts";

/** The full flat `characters` row (derived from the live schema — the factory `X`). */
export type CharacterRow = typeof characters.$inferSelect;
export type CharacterSnapshotRow = typeof characterSnapshots.$inferSelect;
export type CharacterPersonaRow = typeof characterPersonas.$inferSelect;

type CharacterOverrides = Partial<Omit<CharacterRow, "tokenSize">>;

const ids = createIdSource(createSeededIds().next);

/** Pure builder: a fully-valid flat card row. `ownerId` defaults to a MINTED (dangling) id — inserting
 *  the bare `makeCharacter()` output needs the owner row to exist; use `seedCharacter` for the chain.
 *
 *  `contentHash` IS THE PRODUCT'S DERIVATION (#900). It used to default to an opaque `hash_<id>`, which is a
 *  shape the server cannot mint — `verbs/create.ts`/`duplicate.ts`/`restore.ts` all stamp
 *  `cardContentHash(card)`, a 64-char sha-256 over the nine `CARD_IDENTITY_FIELDS`, and two readers RECOMPUTE
 *  and compare it (`verbs/update.ts`'s `contentChanged`, which the embeddings indexer gates re-embedding on,
 *  and the refinery's belt-14 basis fence). A factory row carrying a fake hash makes the first of those
 *  unconditionally true and the second unconditionally stale. It is run over the FINISHED row (overrides
 *  applied) so a caller who edits `name`/`greetings`/`depthPrompt` gets the hash that edit really produces,
 *  and an explicit `contentHash` override still wins — the same shape as the client's `makeCharacterDetail`.
 *
 *  `handle`, BY CONTRAST, IS DELIBERATELY NOT DERIVED (stated so the next reader does not "fix" it into a
 *  defect):
 *
 *  · `handle` is the row's own id, NOT `slugifyHandle(name)`. Deriving it would hand every row in a suite the
 *    SAME handle (the name default is fixed), and `(ownerId, handle)` is unique — every multi-character db
 *    test would collide on insert. The product does not force the coupling either: `createCharacterSchema`
 *    length-validates `handle` and brands it, with no charset or name-derivation refinement, so a hand-set
 *    handle IS a shape the create verb mints. #517 separately retired the client's "is this handle
 *    derivable?" gate, so nothing downstream reads a derivability signal off this field any more. */
export function makeCharacter(overrides: CharacterOverrides = {}, source: IdSource = ids): CharacterRow {
  const id = overrides.id ?? source.typeId(ID_PREFIX.character);
  const row: Omit<CharacterRow, "tokenSize"> = {
    id,
    handle: castId<CharacterHandle>(id),
    ownerId: source.unprefixed<UserId>(),
    starred: false,
    archived: false,
    synthetic: false,
    forbidExternalMedia: null,
    trustHtml: null,
    interactiveHtml: null,
    themeOverride: null,
    backgroundOverride: null,
    importedFrom: null,
    importHash: null,
    importTextHash: null,
    name: "Test Character",
    description: null,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    contentHash: "",
    ...overrides,
  };
  // Both denorms follow the finished card. A deliberately stale contentHash remains an explicit basis
  // input; tokenSize is always producer-derived so normal fixtures retain truthful library ordering.
  return { ...row, contentHash: overrides.contentHash ?? cardContentHash(row), tokenSize: cardTokenSize(row) };
}

/** `makeCharacter` then insert, FK-clean on an empty db: when `overrides.ownerId` is absent a fresh
 *  owner user is seeded first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedCharacter(db: Db, overrides: CharacterOverrides = {}, source?: IdSource): Promise<CharacterRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db, {}, source)).id;
  const row = makeCharacter({ ...overrides, ownerId }, source);
  await db.insert(characters).values(row);
  return row;
}

export interface SeededCreatedCharacter {
  readonly view: Awaited<ReturnType<CharacterService["create"]>>;
  readonly row: CharacterRow;
}

/** The writer owns card defaults, denorms and stamps; its detail projection is not the complete row. */
export async function seedCreatedCharacter(
  db: Db,
  create: CharacterService["create"],
  params: Parameters<CharacterService["create"]>[0],
): Promise<SeededCreatedCharacter> {
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
export async function seedCharacterSnapshot(
  db: Db,
  snapshot: CharacterService["snapshot"],
  params: Parameters<CharacterService["snapshot"]>[0],
): Promise<CharacterSnapshotRow> {
  const ref = await snapshot(params);
  const row = await db.select().from(characterSnapshots).where(eq(characterSnapshots.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production character snapshot left no canonical history row");
  }
  return row;
}

/** Both real ownership gates run before capturing the junction's exact composite key. */
export async function seedCharacterPersona(
  db: Db,
  connectToCharacter: PersonaService["connectToCharacter"],
  params: Parameters<PersonaService["connectToCharacter"]>[0],
): Promise<CharacterPersonaRow> {
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
