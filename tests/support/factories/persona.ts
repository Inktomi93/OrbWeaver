// support/factories/persona — the single-owned `personas` row (D23: `ownerId` KEPT — the persona's own
// partition key). `X` is the SELECT row; `description` is notNull in the schema so the default is `""`
// (never null). Relations are ids by default; `seedPersona` auto-seeds the owner user when absent.

import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedUser } from "./user.ts";

/** The full `personas` row (derived from the live schema — the factory `X`). */
export type PersonaRow = typeof personas.$inferSelect;

const ids = createSeededIds();

/** Pure builder: a fully-valid persona row. `ownerId` defaults to a MINTED (dangling) id — use
 *  `seedPersona` for the FK chain. */
export function makePersona(overrides: Partial<PersonaRow> = {}): PersonaRow {
  return {
    id: castId<PersonaId>(ids.next("persona")),
    ownerId: castId(ids.next("user")),
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
export async function seedPersona(db: Db, overrides: Partial<PersonaRow> = {}): Promise<PersonaRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db)).id;
  const row = makePersona({ ...overrides, ownerId });
  await db.insert(personas).values(row);
  return row;
}
