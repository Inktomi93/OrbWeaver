// verb: backfillAvatars — re-link staged card PNGs to `characters.avatarAssetId`. Load-bearing assertions:
//   • a card whose stored hash matches its recorded `importHash` LINKS the avatar (and the store is real).
//   • a card whose `importHash` does NOT match the stored bytes is counted `mismatched`, NOT linked (the
//     integrity guard — a wrong/corrupt staging file never overwrites the pointer).
//   • a mismatched card is never STORED — the hash verdict is knowable from the bytes, so rejecting it
//     costs no row and no blob (an indexed-then-rejected card is GC's problem an hour later).
//   • `dryRun` writes nothing AND forecasts the real link/mismatch split (the params contract's promise).

import { createHash } from "node:crypto";
import { assets, characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, seedCharacter, seedUser } from "../_support.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function avatarOf(db: Awaited<ReturnType<typeof freshDb>>, characterId: CharacterId): Promise<string | null | undefined> {
  const rows = await db
    .select({ avatarAssetId: characters.avatarAssetId })
    .from(characters)
    .where(eq(characters.id, characterId as never));
  return rows[0]?.avatarAssetId;
}

describe("backfillAvatars", () => {
  test("links the avatar when the stored hash matches importHash", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const bytes = pngBytes(1, 2, 3);

    const result = await svc.backfillAvatars({
      ownerId: owner,
      cards: [{ characterId: character, bytes, importHash: sha256(bytes) }],
    });

    expect(result).toEqual({ scanned: 1, linked: 1, mismatched: 0, dryRun: false });
    // The avatar now points at a stored card asset, and that asset row exists.
    const avatar = await avatarOf(db, character);
    expect(avatar).not.toBeNull();
    const assetRows = await db
      .select()
      .from(assets)
      .where(eq(assets.id, avatar as never));
    expect(assetRows).toHaveLength(1);
  });

  test("counts a hash/importHash mismatch, does not link", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });

    const result = await svc.backfillAvatars({
      ownerId: owner,
      cards: [{ characterId: character, bytes: pngBytes(4, 5), importHash: "deadbeef" }],
    });

    expect(result).toEqual({ scanned: 1, linked: 0, mismatched: 1, dryRun: false });
    expect(await avatarOf(db, character)).toBeNull();
  });

  test("a mismatched card is never STORED — no unreferenced asset is left behind for GC", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const bytes = pngBytes(4, 5);

    await svc.backfillAvatars({
      ownerId: owner,
      cards: [{ characterId: character, bytes, importHash: "deadbeef" }],
    });

    // The integrity verdict is knowable from the bytes alone, so a rejected card must cost nothing: no row…
    expect(await db.select().from(assets)).toHaveLength(0);
    // …and no blob (an indexed-then-rejected card is an unreferenced asset GC has to clean up an hour later).
    expect(await h.ctx.cas.exists(owner, sha256(bytes))).toBe(false);
  });

  test("dryRun forecasts the link/mismatch split without writing anything", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const villain = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("villain") });
    const good = pngBytes(7, 8);
    const bad = pngBytes(9, 10);

    const result = await svc.backfillAvatars({
      ownerId: owner,
      cards: [
        { characterId: hero, bytes: good, importHash: sha256(good) },
        { characterId: villain, bytes: bad, importHash: "deadbeef" },
      ],
      dryRun: true,
    });

    // "Report what WOULD link" (the params contract) — a forecast that always says 0/0 forecasts nothing.
    expect(result).toEqual({ scanned: 2, linked: 1, mismatched: 1, dryRun: true });
    expect(await avatarOf(db, hero)).toBeNull();
    expect(await avatarOf(db, villain)).toBeNull();
    expect(await db.select().from(assets)).toHaveLength(0);
  });
});
