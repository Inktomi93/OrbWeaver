// support/factories/asset — the content-addressed `assets` index row (D21: PER-USER, composite
// `unique(owner_id, hash)`). Mirrors the character.ts contract shape: `makeAsset` mints a dangling
// `ownerId` (pure, no db); `seedAsset` makes the FK real, auto-seeding an owner user when the caller
// didn't hand one in. ~3 db/schema tests hand-rolled this insert with slightly different literals — the
// shared home owns the fully-valid default row.

import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedUser } from "./user.ts";

/** The full `assets` row (derived from the live schema — the factory `X`). */
export type AssetRow = typeof assets.$inferSelect;

const ids = createSeededIds();

/** Pure builder: a fully-valid `assets` row. `ownerId` defaults to a MINTED (dangling) id; `hash` is
 *  padded to a 64-char sha-256-shaped string keyed off the id so distinct assets get distinct hashes
 *  (the composite owner+hash unique never trips on defaults). Use `seedAsset` for the FK chain. */
export function makeAsset(overrides: Partial<AssetRow> = {}): AssetRow {
  const id = overrides.id ?? castId<AssetId>(ids.next("asset"));
  return {
    id,
    ownerId: castId<UserId>(ids.next("user")),
    kind: "card",
    mime: "image/png",
    size: 100,
    hash: id.padEnd(64, "0"),
    uploadedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeAsset` then insert, FK-clean on an empty db: when `overrides.ownerId` is absent a fresh owner
 *  user is seeded first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedAsset(db: Db, overrides: Partial<AssetRow> = {}): Promise<AssetRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db)).id;
  const row = makeAsset({ ...overrides, ownerId });
  await db.insert(assets).values(row);
  return row;
}
