// Seed imagery wiring — the default-character seeder over the REAL character + assets services with the REAL
// `@orb/default-content` reader (the committed avatar PNGs). Proves the end-to-end path
// the composition root wires (`storeAvatar`/`seedGallery` closures over `assets.store` + `assets.addToGallery`):
//   • every character the pack SHIPS ART FOR is born with a NON-NULL `avatarAssetId` (bundled PNG stored +
//     linked) — and a character the pack ships NO art for still seeds, avatar-less (the tolerated arm);
//   • `assets.store({enforceMagic:true})` ACCEPTS the real shipped bytes (the magic-byte sniff agrees — the
//     avatars are png);
//   • each character's gallery holds exactly the pieces the pack actually ships for it;
//   • the whole thing is idempotent (a second run adds no duplicate gallery rows).
// Real db + real CAS temp dir (assets `makeHarness`) — nothing about the store is faked, so the sniff runs
// for real over the committed art.
//
// INVENTORY-DRIVEN, deliberately: the expected counts are computed from what `readSeedAvatar` actually
// returns per handle, not from a hardcoded "every card ships art". That
// keeps this suite honest about the WIRING (which is what it tests) while the art bundle is landed/refreshed
// by a separate lane. The complementary "the pack ships art for all ten handles" assertion is a PACK
// COMPLETENESS property and lives with the pack, not here.

import type { Principal } from "@orb/contracts/identity";
import { readSeedAvatar } from "@orb/default-content";
import type { AssetId, CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { createCharacterService, createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeHarness as makeAssetsHarness } from "../../domain/assets/_support.ts";
import { makeHarness as makeCharacterHarness, principal, realLorebookImport, seedUser } from "../../domain/character/_support.ts";

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
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const actor = principal(owner);
  const seeder = createDefaultCharacterSeeder({
    ...realLorebookImport(db),
    characters,
    attachCardTag: (): Promise<boolean> => Promise.resolve(true),
    markWelcomeAssistant: (): Promise<void> => Promise.resolve(),
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
    },
  });

  return {
    owner,
    actor,
    assets,
    characters,
    runSeed: async (): Promise<void> => {
      for (const card of DEFAULT_CHARACTER_CARDS) {
        await seeder.seedCard(actor, card.input.handle);
      }
    },
  };
}

describe("seed imagery: default-character avatars + starter gallery", () => {
  // PACK COMPLETENESS (the strict row the inventory-driven tests above deliberately do NOT assert): the
  // shipped bundle must carry art for EVERY card in the authored pack. A new default card without its
  // avatar goes red here — the tolerance above keeps the WIRING tests honest, this row keeps the tolerance
  // from rotting into a hole.
  test("the bundle ships an avatar for every card in DEFAULT_CHARACTER_CARDS", async () => {
    const missing = (
      await Promise.all(DEFAULT_CHARACTER_CARDS.map(async (card) => ((await readSeedAvatar(card.input.handle)) === null ? card.input.handle : null)))
    ).filter((handle): handle is CharacterHandle => handle !== null);
    expect(missing, "handles with no bundled avatar PNG").toEqual([]);
  });

  test("a character the bundle ships art for is born with a non-null avatarAssetId (real PNG stored + linked)", async () => {
    const h = await makeSeededHarness();
    await h.runSeed();

    const list = await h.characters.list({ principal: h.actor });
    expect(list.items.length).toBeGreaterThan(0);
    const rows = await Promise.all(
      list.items.map(async (card) => ({
        handle: card.handle,
        hasAvatar: card.avatarAssetId !== null,
        // The tolerated arm: no bundled file ⇒ the card still seeds, just avatar-less (never blocks a seed).
        shipsArt: (await readSeedAvatar(card.handle)) !== null,
      })),
    );
    for (const row of rows) {
      expect(row.hasAvatar, `character ${row.handle}: avatar linked iff the bundle ships one`).toBe(row.shipsArt);
    }
    // The wiring is only proven if SOMETHING went through the real store path.
    expect(rows.filter((r) => r.shipsArt).length, "the bundle must ship at least one avatar for this suite to prove anything").toBeGreaterThan(0);
  });

  test("each seeded character's gallery holds exactly the shipped pieces for it (the avatar, when one ships)", async () => {
    const h = await makeSeededHarness();
    await h.runSeed();

    const list = await h.characters.list({ principal: h.actor });
    const rows = await Promise.all(
      list.items.map(async (card) => {
        const [avatarArt, items] = await Promise.all([
          readSeedAvatar(card.handle),
          h.assets.listGallery({ principal: h.actor, subjectCharacterId: card.id as CharacterId, limit: 100 }),
        ]);
        return { handle: card.handle, expected: avatarArt === null ? 0 : 1, actual: items.length };
      }),
    );
    for (const row of rows) {
      expect(row.actual, `character ${row.handle} gallery`).toBe(row.expected);
    }
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
