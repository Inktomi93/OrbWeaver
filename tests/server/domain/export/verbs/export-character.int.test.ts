// Integration: exportCharacter against a real :memory: db. Pins the load-bearing behaviour:
//   • the flat-card → V3-PNG → re-parse round-trip (the artifact re-imports cleanly through the SHARED
//     cardFromJson IN adapter — the one-serde-core invariant);
//   • owner-scoping (a foreign / missing character returns null — no existence leak);
//   • accepted-only tags (pending suggestions are NOT serialized);
//   • the book walk (attached books' entries ride into the card's character_book);
//   • avatar embedding (the avatar blob is the base; a non-PNG is transcoded via the injected op; a
//     missing/absent avatar falls back to the placeholder via a SINGLE TOCTOU-safe cas.read).

import { characterCardV3Schema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isPng, readCardChunk } from "@orb/kit/png-card-chunk";
import { createExportService } from "@orb/server/domain/export";
import { cardFromJson } from "@orb/server/kit/serde/card";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  AVATAR_PNG,
  makeHarness,
  principal,
  seedAsset,
  seedCharacter,
  seedCharacterBook,
  seedCharacterTag,
  seedTag,
  seedUser,
  seedWorldBook,
  seedWorldEntry,
} from "../_support.ts";

const AVATAR_HASH = "avatar_hash";

/** Decode the V3 card JSON embedded in an exported PNG (the `ccv3` chunk). */
function readCard(bytes: Uint8Array): unknown {
  const json = readCardChunk(bytes, "ccv3");
  if (json === null) {
    throw new Error("exported PNG carried no ccv3 card chunk");
  }
  return JSON.parse(json);
}

describe("exportCharacter", () => {
  test("serializes the live card to a V3 PNG that re-parses cleanly (round-trip)", async () => {
    const db = await freshDb();
    const { ctx } = makeHarness(db);
    const svc = createExportService(ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await seedCharacter(db, {
      ownerId: owner,
      name: "Aria",
      description: "A brave knight",
      greetings: ["Hello there", "Hi again"],
      creator: "nate",
      cardVersion: "1.2",
    });

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    if (result === null) {
      throw new Error("expected an exported card");
    }

    expect(result.filename).toBe("Aria.png");
    expect(isPng(result.bytes)).toBe(true);
    const card = readCard(result.bytes);
    // valid V3 wire + a clean re-parse through the shared IN adapter.
    expect(() => characterCardV3Schema.parse(card)).not.toThrow();
    const back = cardFromJson(card, "fallback");
    expect(back.name).toBe("Aria");
    expect(back.description).toBe("A brave knight");
    expect(back.greetings).toEqual(["Hello there", "Hi again"]);
    expect(back.creator).toBe("nate");
    expect(back.cardVersion).toBe("1.2");
  });

  test("serializes ACCEPTED tags only; pending suggestions are dropped", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await seedCharacter(db, { ownerId: owner, name: "Tagged" });
    const accepted = await seedTag(db, owner, "fantasy");
    const pending = await seedTag(db, owner, "draft");
    await seedCharacterTag(db, character, accepted, "accepted");
    await seedCharacterTag(db, character, pending, "pending");

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    const card = characterCardV3Schema.parse(readCard(result?.bytes ?? new Uint8Array()));
    expect(card.data.tags).toEqual(["fantasy"]);
  });

  test("walks attached books into the card's character_book (de-duped by entry)", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await seedCharacter(db, { ownerId: owner });
    const book = await seedWorldBook(db, owner);
    await seedWorldEntry(db, {
      worldBookId: book,
      title: "Dragons",
      content: "they breathe fire",
      keys: ["dragon"],
    });
    await seedCharacterBook(db, character, book);

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    const card = characterCardV3Schema.parse(readCard(result?.bytes ?? new Uint8Array()));
    expect(card.data.character_book?.entries).toHaveLength(1);
    expect(card.data.character_book?.entries[0]?.content).toBe("they breathe fire");
  });

  test("embeds the owner's PNG avatar as the base (single cas.read; no transcode)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createExportService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner, hash: AVATAR_HASH, mime: "image/png" });
    harness.putBlob(owner, AVATAR_HASH, AVATAR_PNG);
    const withAvatar = await seedCharacter(db, { ownerId: owner, avatarAssetId: avatar });
    const withoutAvatar = await seedCharacter(db, {
      id: "character_plain",
      ownerId: owner,
      handle: "plain",
    });

    const a = await svc.exportCharacter({ principal: principal(owner), characterId: withAvatar });
    const b = await svc.exportCharacter({
      principal: principal(owner),
      characterId: withoutAvatar,
    });

    // a single cas.read for the avatar (TOCTOU-safe); no transcode for an already-PNG avatar.
    expect(harness.reads).toEqual([`${owner}:${AVATAR_HASH}`]);
    expect(harness.transforms).toHaveLength(0);
    // the avatar-based artifact differs from the placeholder-based one (proves the avatar was the base),
    // yet both carry a readable card.
    expect(a?.bytes).not.toEqual(b?.bytes);
    expect(readCardChunk(a?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
    expect(readCardChunk(b?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
  });

  test("transcodes a non-PNG avatar via the injected imageTransform op", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createExportService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner, hash: AVATAR_HASH, mime: "image/jpeg" });
    harness.putBlob(owner, AVATAR_HASH, AVATAR_PNG);
    const character = await seedCharacter(db, { ownerId: owner, avatarAssetId: avatar });

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    expect(harness.transforms).toHaveLength(1);
    expect(harness.transforms[0]?.format).toBe("png");
    expect(isPng(result?.bytes ?? new Uint8Array())).toBe(true);
  });

  test("falls back to the placeholder when the avatar blob is absent (ENOENT)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createExportService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    // asset row exists but the blob was never put into the CAS → cas.read rejects ENOENT.
    const avatar = await seedAsset(db, { ownerId: owner, hash: AVATAR_HASH });
    const character = await seedCharacter(db, { ownerId: owner, avatarAssetId: avatar });

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    expect(harness.reads).toEqual([`${owner}:${AVATAR_HASH}`]);
    expect(harness.transforms).toHaveLength(0);
    expect(isPng(result?.bytes ?? new Uint8Array())).toBe(true);
    expect(readCardChunk(result?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
  });

  test("returns null for a character owned by someone else (no existence leak)", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const character = await seedCharacter(db, { ownerId: owner });

    const result = await svc.exportCharacter({
      principal: principal(other),
      characterId: character,
    });
    expect(result).toBeNull();
  });

  test("returns null for a missing character", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: castId<CharacterId>("character_ghost"),
    });
    expect(result).toBeNull();
  });
});
