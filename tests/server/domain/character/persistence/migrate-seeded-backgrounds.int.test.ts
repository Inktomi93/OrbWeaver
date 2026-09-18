// persistence/migrate-seeded-backgrounds — the `kind:"seeded"` retirement's CARD half (owner ask
// 2026-09-18). The `domain/settings` `migrate-seeded-background-picks` sibling, over
// `characters.background_override`.
//
// The same three row classes, and the same reason they are the test: `themeBackgroundSchema` heals an
// unknown kind to `none` at every parse, so an un-migrated card does not crash — it just stops painting the
// scene plate the pack dressed it with, and nothing reds. The control below is the un-migrated read.
//
// ONE EXTRA CLAIM THIS HALF OWES: the rewrite is OWNER-SCOPED. It must not touch another user's card, both
// because the plate asset it points at lives in the caller's own CAS partition and because a cross-user
// background reference is a GC root nobody asked for.

import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource, themeBackgroundSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { migrateSeededCardBackgrounds } from "../../../../../packages/server/src/domain/character/persistence/migrate-seeded-backgrounds.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedRawCharacter, seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;
const SHIPPED_SLUG = "niko-bg";
const DELETED_SLUG = "blue-fjord";
const PLATE: ThemeBackground = canonicalBackgroundSource({
  kind: "asset",
  assetId: "asset_plate_niko",
  assetHash: "hash_plate_niko",
  mime: "image/jpeg",
  externalUrl: "",
  provenanceUrl: "",
});

/** slug → the caller's own plate asset; `null` for a slug the pack no longer ships. */
function resolver(slug: string): Promise<ThemeBackground | null> {
  return Promise.resolve(slug === SHIPPED_SLUG ? PLATE : null);
}

/** One owned card, inserted raw (the CRUD wire cannot author a retired background kind), optionally with a
 *  carried background written straight onto the column — `seedRawCharacter` carries no background override. */
async function card(db: Db, ownerId: UserId, handle: string, background?: ThemeBackground): Promise<CharacterId> {
  const id = await seedRawCharacter(db, { id: `character_${handle}`, handle: castId<CharacterHandle>(handle), ownerId });
  if (background !== undefined) {
    await db.update(characters).set({ backgroundOverride: background }).where(eq(characters.id, id));
  }
  return id;
}

/** Write the RAW legacy carried shape straight onto the column — a parse would have collapsed it. */
async function setLegacyCardBackground(db: Db, characterId: CharacterId, slug: string): Promise<void> {
  await db
    .update(characters)
    .set({ backgroundOverride: { kind: "seeded", seededId: slug, externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" } as never })
    .where(eq(characters.id, characterId));
}

async function readBackground(db: Db, characterId: CharacterId): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  return (rows[0]?.backgroundOverride ?? null) as Record<string, unknown> | null;
}

test("THE CONTROL — an un-migrated card parses back to `none`, losing its plate silently", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ctrlowner") });
  const subject = await card(db, owner, "ctrlcard");
  await setLegacyCardBackground(db, subject, SHIPPED_SLUG);

  expect((await readBackground(db, subject))?.["kind"], "the stored row really carries the retired kind").toBe("seeded");
  // No throw, no red — the plate just stops existing as far as every reader is concerned.
  expect(themeBackgroundSchema.parse(await readBackground(db, subject)).kind).toBe("none");
});

test("class 1 — a still-shipped slug becomes the owner's own plate asset (and is GC-rooted by being one)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("keepowner") });
  const subject = await card(db, owner, "keepcard");
  await setLegacyCardBackground(db, subject, SHIPPED_SLUG);

  expect(await migrateSeededCardBackgrounds(db, owner, resolver, AT)).toBe(1);

  const after = await readBackground(db, subject);
  expect(after?.["kind"]).toBe("asset");
  expect(after?.["assetId"]).toBe(PLATE.assetId);
  expect(after?.["assetHash"]).toBe(PLATE.assetHash);
  // `characters.background_override` with `kind:"asset"` IS one of the two carried-background JSON
  // live-sources the GC roots (`domain/assets/persistence/asset-refs.ts`), so the rewrite creates a
  // reference rather than dropping one — a `seeded` value rooted nothing at all.
  expect(after?.["mime"]).toBe("image/jpeg");
});

test("class 2 — a deleted placeholder slug clears to `none` with no smuggled asset reference", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("dropowner") });
  const subject = await card(db, owner, "dropcard");
  await setLegacyCardBackground(db, subject, DELETED_SLUG);

  expect(await migrateSeededCardBackgrounds(db, owner, resolver, AT)).toBe(1);

  const after = await readBackground(db, subject);
  expect(after?.["kind"]).toBe("none");
  expect(after?.["assetId"]).toBe("");
  expect(after?.["assetHash"]).toBe("");
});

test("class 3 — a card that never carried `seeded` is untouched, and a SECOND pass rewrites nothing", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ownpick") });
  const subject = await card(db, owner, "ownpickcard", PLATE);

  expect(await migrateSeededCardBackgrounds(db, owner, resolver, AT)).toBe(0);
  expect((await readBackground(db, subject))?.["assetId"]).toBe(PLATE.assetId);

  const legacy = await card(db, owner, "legacycard");
  await setLegacyCardBackground(db, legacy, SHIPPED_SLUG);
  expect(await migrateSeededCardBackgrounds(db, owner, resolver, AT)).toBe(1);
  // Idempotent by its own predicate — the rewritten row no longer matches, so no marker column can disagree.
  expect(await migrateSeededCardBackgrounds(db, owner, resolver, AT + 1)).toBe(0);
});

test("the sweep is OWNER-SCOPED — another user's legacy card is not rewritten under this owner's plates", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { handle: castId<Handle>("mineowner") });
  const theirs = await seedUser(db, { handle: castId<Handle>("theirowner") });
  const myCard = await card(db, mine, "minecard");
  const theirCard = await card(db, theirs, "theircard");
  await setLegacyCardBackground(db, myCard, SHIPPED_SLUG);
  await setLegacyCardBackground(db, theirCard, SHIPPED_SLUG);

  expect(await migrateSeededCardBackgrounds(db, mine, resolver, AT)).toBe(1);

  expect((await readBackground(db, myCard))?.["kind"]).toBe("asset");
  // Untouched: their card's plate is THEIR asset to mint, on their own next seed pass. Pointing it at mine
  // would be a cross-user CAS reference this migration has no standing to create.
  expect((await readBackground(db, theirCard))?.["kind"]).toBe("seeded");
});

test("a `seeded` value with a BLANK slug clears rather than asking the resolver", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("blankowner") });
  const subject = await card(db, owner, "blankcard");
  await setLegacyCardBackground(db, subject, "");
  let asked = 0;
  const counting = (slug: string): Promise<ThemeBackground | null> => {
    asked += 1;
    return resolver(slug);
  };

  expect(await migrateSeededCardBackgrounds(db, owner, counting, AT)).toBe(1);
  expect(asked, "an empty slug names no plate — there is nothing to resolve").toBe(0);
  expect((await readBackground(db, subject))?.["kind"]).toBe("none");
});
