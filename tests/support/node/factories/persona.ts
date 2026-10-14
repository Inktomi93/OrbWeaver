// support/factories/persona — the single-owned `personas` row (D23: `ownerId` KEPT — the persona's own
// partition key). `X` is the SELECT row; `description` is notNull in the schema so the default is `""`
// (never null). Relations are ids by default; `seedPersona` auto-seeds the owner user when absent.

import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { seedUser } from "./user.ts";

/** The full `personas` row (derived from the live schema — the factory `X`). */
export type PersonaRow = typeof personas.$inferSelect;

const ids = createIdSource(createSeededIds().next);

/** Pure builder: a fully-valid persona row. `ownerId` defaults to a MINTED (dangling) id — use
 *  `seedPersona` for the FK chain. */
export function makePersona(overrides: Partial<PersonaRow> = {}, source: IdSource = ids): PersonaRow {
  return {
    id: source.typeId(ID_PREFIX.persona),
    ownerId: source.unprefixed<UserId>(),
    name: "Test Persona",
    title: null,
    description: "",
    starred: false,
    avatarAssetId: null,
    metadata: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makePersona` then insert, FK-clean on an empty db: an absent `ownerId` seeds a fresh owner user
 *  first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedPersona(db: Db, overrides: Partial<PersonaRow> = {}, source?: IdSource): Promise<PersonaRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db, {}, source)).id;
  const row = makePersona({ ...overrides, ownerId }, source);
  await db.insert(personas).values(row);
  return row;
}
