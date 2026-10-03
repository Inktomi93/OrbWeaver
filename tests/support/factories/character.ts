// support/factories/character — the flat `characters` card row (D28: no version table; the card IS the
// row). `X` is the SELECT row so defaults are fully-valid + complete (always-a-list columns default `[]`,
// never null — the parseStringArray asymmetry). Relations are ids by default: `makeCharacter` mints a
// dangling `ownerId` (pure — no db); `seedCharacter` makes the FK real, auto-seeding an owner user when
// the caller didn't hand one in (the neo FK-chain lesson, minus the dead version tier).

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// The card identity hash's ONE home — `@orb/server/kit` is the server-only-PURE bottom tier
// (`.dependency-cruiser.cjs`: node:* + db + contracts + kit, reaching up to nothing), so importing it
// downward from a factory pulls `node:crypto` and two contracts, never a domain graph. D9 names this
// subpath family canonical and 19 of them are already imported across `tests/server/**`.
import { cardContentHash } from "@orb/server/kit/serde/card";
import { sql } from "drizzle-orm";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedUser } from "./user.ts";

/** The full flat `characters` row (derived from the live schema — the factory `X`). */
export type CharacterRow = typeof characters.$inferSelect;

const ids = createSeededIds();

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
export function makeCharacter(overrides: Partial<CharacterRow> = {}): CharacterRow {
  const id = overrides.id ?? castId<CharacterId>(ids.next("character"));
  const row: CharacterRow = {
    id,
    handle: castId<CharacterHandle>(id),
    ownerId: castId<UserId>(ids.next("user")),
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
    tokenSize: 0,
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
  // The write-side stamp, over the row this factory actually built (`verbs/create.ts:98`). An explicit
  // override wins — a suite pinning a specific basis/stale-hash arm states it and keeps it.
  return { ...row, contentHash: overrides.contentHash ?? cardContentHash(row) };
}

/** `makeCharacter` then insert, FK-clean on an empty db: when `overrides.ownerId` is absent a fresh
 *  owner user is seeded first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedCharacter(db: Db, overrides: Partial<CharacterRow> = {}): Promise<CharacterRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db)).id;
  const row = makeCharacter({ ...overrides, ownerId });
  await db.insert(characters).values(row);
  return row;
}

/** `seedCharacter` for a db the migrator stopped at a PAST migration point. The drizzle insert names every
 *  column of the LIVE schema, so it fails on a db that predates a later `ADD COLUMN`. This raw insert names
 *  only the NOT NULL columns without a default, which every migration since `0000_baseline` carries; the
 *  rest take their schema defaults. */
export async function seedCharacterAtBaseline(db: Db, overrides: Partial<CharacterRow> = {}): Promise<CharacterRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db)).id;
  const row = makeCharacter({ ...overrides, ownerId });
  await db.run(
    sql`INSERT INTO characters (id, handle, owner_id, content_hash, name) VALUES (${row.id}, ${row.handle}, ${row.ownerId}, ${row.contentHash}, ${row.name})`,
  );
  return row;
}
