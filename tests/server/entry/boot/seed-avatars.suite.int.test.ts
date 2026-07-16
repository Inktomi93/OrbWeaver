// Seed imagery wiring — the default-character seeder over the REAL character + assets services with the REAL
// bundled `seed-assets` reader (the committed avatar PNGs + gallery WebPs). Proves the end-to-end path the
// composition root wires (`storeAvatar`/`seedGallery` closures over `assets.store` + `assets.addToGallery`):
//   • every seeded character is born with a NON-NULL `avatarAssetId` (the bundled PNG stored, avatar linked);
//   • `assets.store({enforceMagic:true})` ACCEPTS the real bundled bytes (the magic-byte sniff agrees —
//     avatars are png, gallery pieces are webp);
//   • each character's gallery starts NON-EMPTY (its avatar + a bundled generative piece);
//   • the whole thing is idempotent (a second run adds no duplicate gallery rows).
// Real db + real CAS temp dir (assets `makeHarness`) — nothing about the store is faked, so the sniff runs
// for real over the committed art.

import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { createCharacterService, createDefaultCharacterSeeder } from "@orb/server/domain/character";
import { describe, onTestFinished } from "vitest";
import { readSeedAvatar, readSeedGalleryPiece } from "../../../../packages/server/src/entry/boot/seed-assets/index.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness as makeAssetsHarness } from "../../domain/assets/_support.ts";
import { makeHarness as makeCharacterHarness, principal, seedUser } from "../../domain/character/_support.ts";

/** In-memory settings latch (isSeeded/markSeeded), keyed by userId — the compose wiring of the real latch is
 *  proven in the compose slice test; here we only need the seeder to run once. */
function fakeLatch(): {
  readonly isSeeded: (p: Principal) => Promise<boolean>;
  readonly markSeeded: (p: Principal) => Promise<void>;
} {
  const seeded = new Set<UserId>();
  return {
    isSeeded: (p): Promise<boolean> => Promise.resolve(seeded.has(p.userId)),
    markSeeded: (p): Promise<void> => {
      seeded.add(p.userId);
      return Promise.resolve();
    },
  };
}

/** Build the real character seeder wired with the REAL bundled-avatar `storeAvatar`/`seedGallery` closures
 *  (the exact composition the entry root builds), over shared real character + assets services on one db. */
async function makeSeededHarness(): Promise<{
  readonly owner: UserId;
  readonly actor: Principal;
  readonly assets: ReturnType<typeof createAssetsService>;
  readonly characters: ReturnType<typeof createCharacterService>;
  readonly runSeed: () => Promise<void>;
}> {
  const db = await freshDb();
  const assetsHarness = await makeAssetsHarness(db);
  onTestFinished(assetsHarness.cleanup);
  const assets = createAssetsService(assetsHarness.ctx);
  const characters = createCharacterService(makeCharacterHarness(db).ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const actor = principal(owner);
  const latch = fakeLatch();

  const seeder = createDefaultCharacterSeeder({
    characters,
    attachCardTag: (): Promise<boolean> => Promise.resolve(true),
    ...latch,
    storeAvatar: async (p, handle): Promise<AssetId | null> => {
      const art = await readSeedAvatar(handle);
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal: p,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    seedGallery: async (p, characterId, handle): Promise<void> => {
      const avatarArt = await readSeedAvatar(handle);
      if (avatarArt !== null) {
        const a = await assets.store({
          principal: p,
          bytes: avatarArt.bytes,
          kind: "avatar",
          mime: avatarArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal: p,
          assetId: a.assetId,
          subjectCharacterId: characterId,
        });
      }
      const galleryArt = await readSeedGalleryPiece(handle);
      if (galleryArt !== null) {
        const g = await assets.store({
          principal: p,
          bytes: galleryArt.bytes,
          kind: "gallery",
          mime: galleryArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal: p,
          assetId: g.assetId,
          subjectCharacterId: characterId,
        });
      }
    },
  });

  return { owner, actor, assets, characters, runSeed: () => seeder.ensureSeeded(actor) };
}

describe("seed imagery: default-character avatars + starter gallery", () => {
  test("every seeded character is born with a non-null avatarAssetId (real bundled PNG stored + linked)", async () => {
    const h = await makeSeededHarness();
    await h.runSeed();

    const list = await h.characters.list({ principal: h.actor });
    expect(list.items.length).toBeGreaterThan(0);
    for (const card of list.items) {
      expect(card.avatarAssetId, `character ${card.handle} should have a seeded avatar`).not.toBeNull();
    }
  });

  test("each seeded character's gallery starts non-empty (avatar + a bundled generative piece)", async () => {
    const h = await makeSeededHarness();
    await h.runSeed();

    const list = await h.characters.list({ principal: h.actor });
    const perCharacter = await Promise.all(
      list.items.map(async (card) => ({
        handle: card.handle,
        items: await h.assets.listGallery({
          principal: h.actor,
          subjectCharacterId: card.id as CharacterId,
          limit: 100,
        }),
      })),
    );
    for (const { handle, items } of perCharacter) {
      // Avatar (png) + gallery piece (webp) = 2 starter items per character (every card ships both).
      expect(items.length, `character ${handle} gallery`).toBe(2);
    }
    // Overall the gallery holds the whole starter set.
    const all = await h.assets.listGallery({ principal: h.actor, limit: 100 });
    expect(all.length).toBe(list.items.length * 2);
  });

  test("idempotent: a second seed run adds no duplicate gallery rows", async () => {
    const h = await makeSeededHarness();
    await h.runSeed();
    const first = await h.assets.listGallery({ principal: h.actor, limit: 100 });
    // A fresh seeder over the SAME persisted latch is a no-op; but even re-driving the gallery adds is
    // upsert-guarded — assert the count is stable by re-running the whole ensureSeeded (latch short-circuits).
    await h.runSeed();
    const second = await h.assets.listGallery({ principal: h.actor, limit: 100 });
    expect(second.length).toBe(first.length);
  });
});
