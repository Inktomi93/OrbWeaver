// verb: backfillAvatars — re-link staged card PNGs to `characters.avatarAssetId`. Load-bearing assertions:
//   • a card whose stored hash matches its recorded `importHash` LINKS the avatar (and the store is real).
//   • a card whose `importHash` does NOT match the stored bytes is counted `mismatched`, NOT linked (the
//     integrity guard — a wrong/corrupt staging file never overwrites the pointer).
//   • `dryRun` writes nothing (no store, no link).

import { createHash } from "node:crypto";
import { assets, characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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

  test("dryRun writes nothing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const bytes = pngBytes(7, 8);

    const result = await svc.backfillAvatars({
      ownerId: owner,
      cards: [{ characterId: character, bytes, importHash: sha256(bytes) }],
      dryRun: true,
    });

    expect(result).toEqual({ scanned: 1, linked: 0, mismatched: 0, dryRun: true });
    expect(await avatarOf(db, character)).toBeNull();
    expect(await db.select().from(assets)).toHaveLength(0);
  });
});
