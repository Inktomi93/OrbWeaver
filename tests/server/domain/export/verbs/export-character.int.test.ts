// Integration: exportCharacter against a real :memory: db. Pins the load-bearing behaviour:
//   • the flat-card → V3-PNG → re-parse round-trip (the artifact re-imports cleanly through the SHARED
//     cardFromJson IN adapter — the one-serde-core invariant);
//   • owner-scoping (a foreign / missing character returns null — no existence leak);
//   • accepted-only tags (pending suggestions are NOT serialized);
//   • the book walk (attached books' entries ride into the card's character_book);
//   • avatar embedding (the avatar blob is the base; a non-PNG is transcoded via the injected op; a
//     missing/absent avatar falls back to the placeholder via a SINGLE TOCTOU-safe cas.read).

import { characterCardV3Schema } from "@orb/contracts/character";
import { characterBooks } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isPng, readCardChunk } from "@orb/kit/png-card-chunk";
import { createExportService } from "@orb/server/domain/export";
import { parseCardPng } from "@orb/server/domain/import";
import { createLinkCarriedBooks } from "@orb/server/domain/world-info";
import { cardFromJson } from "@orb/server/kit/serde/card";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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

async function readCard(bytes: Uint8Array): Promise<unknown> {
  const json = await readCardChunk(bytes, "ccv3");
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, {
      ownerId: owner,
      name: "Aria",
      description: "A brave knight",
      greetings: [{ text: "Hello there" }, { text: "Hi again" }],
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
    const card = await readCard(result.bytes);
    expect(() => characterCardV3Schema.parse(card)).not.toThrow();
    const back = cardFromJson(card, "fallback");
    expect(back.name).toBe("Aria");
    expect(back.description).toBe("A brave knight");
    expect(back.greetings).toEqual([{ text: "Hello there" }, { text: "Hi again" }]);
    expect(back.creator).toBe("nate");
    expect(back.cardVersion).toBe("1.2");
  });

  test("serializes ACCEPTED tags only; pending suggestions are dropped", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner, name: "Tagged" });
    const accepted = await seedTag(db, owner, "fantasy");
    const pending = await seedTag(db, owner, "draft");
    await seedCharacterTag(db, character, accepted, "accepted");
    await seedCharacterTag(db, character, pending, "pending");

    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: character,
    });
    const card = characterCardV3Schema.parse(await readCard(result?.bytes ?? new Uint8Array()));
    expect(card.data.tags).toEqual(["fantasy"]);
  });

  test("walks attached books into the card's character_book (de-duped by entry)", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const book = await seedWorldBook(db, owner, "world_book_0000000000000000000000000c");
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
    const card = characterCardV3Schema.parse(await readCard(result?.bytes ?? new Uint8Array()));
    expect(card.data.character_book?.entries).toHaveLength(1);
    expect(card.data.character_book?.entries[0]?.content).toBe("they breathe fire");
  });

  // ── PD-144 — attached-book REFERENCES (portability twin of the PD-141 duplicate carry) ────────────────

  test("bundles the attached-book references with their roles (never the book content)", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const primary = await seedWorldBook(db, owner, "world_book_000000000000000000000000p1");
    const aux = await seedWorldBook(db, owner, "world_book_00000000000000000000000ax1");
    await seedCharacterBook(db, character, primary, "primary");
    await seedCharacterBook(db, character, aux, "auxiliary");

    const result = await svc.exportCharacter({ principal: principal(owner), characterId: character });
    const card = characterCardV3Schema.parse(await readCard(result?.bytes ?? new Uint8Array()));

    expect(new Set(card.data.orbweaver_attached_books)).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
  });

  test("round-trip on the SAME install: the references restore the exact junctions + roles", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await seedCharacter(db, { ownerId: owner, id: "character_src", handle: castId<CharacterHandle>("src") });
    const primary = await seedWorldBook(db, owner, "world_book_000000000000000000000000p1");
    const aux = await seedWorldBook(db, owner, "world_book_00000000000000000000000ax1");
    await seedCharacterBook(db, source, primary, "primary");
    await seedCharacterBook(db, source, aux, "auxiliary");

    // Export → re-parse the emitted card back into its carried references (the IN half of the serde).
    const exported = await svc.exportCharacter({ principal: principal(owner), characterId: source });
    const refs = (await parseCardPng(exported?.bytes ?? new Uint8Array(), "src"))?.attachedBooks ?? [];

    // Import lands a fresh character on the same install; the re-link op re-points the SAME books at it.
    const target = await seedCharacter(db, { ownerId: owner, id: "character_dst", handle: castId<CharacterHandle>("dst") });
    const linked = await createLinkCarriedBooks({ db, now: (): number => 1 })({ ownerId: owner, characterId: target, refs });

    expect(linked).toEqual({ linked: 2, skipped: 0 });
    const junctions = await db
      .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
      .from(characterBooks)
      .where(eq(characterBooks.characterId, target));
    expect(new Set<{ worldBookId: WorldBookId; role: string }>(junctions)).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
  });

  test("embeds the owner's PNG avatar as the base (single cas.read; no transcode)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createExportService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner, hash: AVATAR_HASH, mime: "image/png" });
    harness.putBlob(owner, AVATAR_HASH, AVATAR_PNG);
    const withAvatar = await seedCharacter(db, { ownerId: owner, avatarAssetId: avatar });
    const withoutAvatar = await seedCharacter(db, {
      id: "character_plain",
      ownerId: owner,
      handle: castId<CharacterHandle>("plain"),
    });

    const a = await svc.exportCharacter({ principal: principal(owner), characterId: withAvatar });
    const b = await svc.exportCharacter({
      principal: principal(owner),
      characterId: withoutAvatar,
    });

    expect(harness.reads).toEqual([`${owner}:${AVATAR_HASH}`]);
    expect(harness.transforms).toHaveLength(0);
    expect(a?.bytes).not.toEqual(b?.bytes);
    expect(await readCardChunk(a?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
    expect(await readCardChunk(b?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
  });

  test("transcodes a non-PNG avatar via the injected imageTransform op", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createExportService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    expect(await readCardChunk(result?.bytes ?? new Uint8Array(), "ccv3")).not.toBeNull();
  });

  test("returns null for a character owned by someone else (no existence leak)", async () => {
    const db = await freshDb();
    const svc = createExportService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const result = await svc.exportCharacter({
      principal: principal(owner),
      characterId: castId<CharacterId>("character_ghost"),
    });
    expect(result).toBeNull();
  });
});
