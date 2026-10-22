// Asset row defaults describe actual synthetic PNG bytes; the seed helper makes the owner FK real.

import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { sniffImageBytes, sniffMime } from "@orb/kit/image-sniff";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { AssetsService } from "@orb/server/domain/assets";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { and, eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { ServerProducerRoot } from "../server.ts";
import { seedUser } from "./user.ts";

/** The full `assets` row (derived from the live schema — the factory `X`). */
export type AssetRow = typeof assets.$inferSelect;

const ids = createIdSource(createSeededIds().next);
const BASE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=",
  "base64",
);

/** Distinct, deterministic image bytes for a real asset-store input. */
export function makeAssetBytes(assetId: AssetId): Uint8Array {
  return writeCardChunk(BASE_PNG, JSON.stringify({ fixtureAssetId: assetId }));
}

/** Builds the byte-derived index facts; use {@link seedAsset} to persist its owner relation. */
export function makeAsset(overrides: Partial<AssetRow> = {}, source: IdSource = ids): AssetRow {
  const id = overrides.id ?? source.typeId(ID_PREFIX.asset);
  const bytes = makeAssetBytes(id);
  const sniffed = sniffImageBytes(bytes);
  return {
    id,
    ownerId: source.unprefixed<UserId>(),
    kind: "card",
    mime: sniffMime(bytes),
    size: bytes.byteLength,
    hash: sha256Hex(bytes),
    animated: sniffed?.animated ?? false,
    width: sniffed?.width ?? null,
    height: sniffed?.height ?? null,
    uploadedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeAsset` then insert, FK-clean on an empty db: when `overrides.ownerId` is absent a fresh owner
 *  user is seeded first (explicit `ownerId` reuses the caller's user — no extra row). */
export async function seedAsset(db: Db, overrides: Partial<AssetRow> = {}, source?: IdSource): Promise<AssetRow> {
  const ownerId = overrides.ownerId ?? (await seedUser(db, {}, source)).id;
  const row = makeAsset({ ...overrides, ownerId }, source);
  await db.insert(assets).values(row);
  return row;
}

export interface SeededStoredAsset {
  readonly stored: Awaited<ReturnType<AssetsService["store"]>>;
  readonly row: AssetRow;
}

/** Capture the CAS-backed writer's actual identity, including an existing owner's dedup winner. */
export async function seedStoredAsset(root: ServerProducerRoot, params: Parameters<AssetsService["store"]>[0]): Promise<SeededStoredAsset> {
  const db = root.db;
  const store = root.services.assets.store;
  const stored = await store(params);
  const row = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, stored.assetId), eq(assets.ownerId, params.principal.userId)))
    .get();
  if (row === undefined) {
    throw new Error("production asset store left no canonical owned row");
  }
  return { stored, row };
}
