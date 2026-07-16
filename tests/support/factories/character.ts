// support/factories/character — the flat `characters` card row (D28: no version table; the card IS the
// row). `X` is the SELECT row so defaults are fully-valid + complete (always-a-list columns default `[]`,
// never null — the parseStringArray asymmetry). Relations are ids by default: `makeCharacter` mints a
// dangling `ownerId` (pure — no db); `seedCharacter` makes the FK real, auto-seeding an owner user when
// the caller didn't hand one in (the neo FK-chain lesson, minus the dead version tier).

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedUser } from "./user.ts";

/** The full flat `characters` row (derived from the live schema — the factory `X`). */
export type CharacterRow = typeof characters.$inferSelect;

const ids = createSeededIds();

/** Pure builder: a fully-valid flat card row. `ownerId` defaults to a MINTED (dangling) id — inserting
 *  the bare `makeCharacter()` output needs the owner row to exist; use `seedCharacter` for the chain. */
export function makeCharacter(overrides: Partial<CharacterRow> = {}): CharacterRow {
  const id = overrides.id ?? castId<CharacterId>(ids.next("character"));
  return {
    id,
    handle: id,
    ownerId: castId<UserId>(ids.next("user")),
    starred: false,
    archived: false,
    synthetic: false,
    forbidExternalMedia: null,
    trustHtml: null,
    themeOverride: null,
    importedFrom: null,
    importHash: null,
    contentHash: `hash_${id}`,
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
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
    createdAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeCharacter` then insert, FK-clean on an empty db: when `overrides.ownerId` is absent a fresh
 *  owner user is seeded first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedCharacter(db: Db, overrides: Partial<CharacterRow> = {}): Promise<CharacterRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db)).id;
  const row = makeCharacter({ ...overrides, ownerId });
  await db.insert(characters).values(row);
  return row;
}
