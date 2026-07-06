// verb: getMetadata — the owner-gated blob-serve gate (D21). Load-bearing: "not found" and "not yours"
// collapse into one answer (undefined → 404; no foreign-existence leak).

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { AssetsHarness } from "../_support.ts";
import {
  makeHarness,
  pngBytes,
  principal,
  seedCharacter,
  seedChatRow,
  seedParticipant,
  seedUser,
  setCharacterAvatar,
} from "../_support.ts";

const PNG = "image/png";

interface AvatarScenario {
  readonly svc: AssetsService;
  readonly charOwner: UserId;
  readonly caller: UserId;
  readonly character: CharacterId;
  readonly avatarHash: string;
  readonly avatarSize: number;
}

describe("getMetadata", () => {
  test("returns {mime,size} for an owned asset", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const bytes = pngBytes(1, 2, 3, 4);

    const stored = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });

    const meta = await svc.getMetadata({ principal: principal(owner), hash: stored.hash });
    expect(meta).toEqual({ mime: PNG, size: bytes.byteLength });
  });

  test("another user's asset is indistinguishable from missing (undefined)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5, 5),
      kind: "avatar",
      mime: PNG,
    });

    const meta = await svc.getMetadata({ principal: principal(other), hash: stored.hash });
    expect(meta).toBeUndefined();
  });

  test("a missing hash returns undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const meta = await svc.getMetadata({ principal: principal(owner), hash: "f".repeat(64) });
    expect(meta).toBeUndefined();
  });
});

// PD-107 / D21 — the roster-avatar REFERENCE-CHECK closes the known-bytes oracle. The fallback returns an
// owner ONLY IF the hash is the `avatarAssetId` of a CHARACTER rostered (present) in a chat the caller is a
// PRESENT member of. These cases prove the positive path AND that the four oracle-closing conditions all
// yield `undefined` (indistinguishable from a plain miss). The caller NEVER owns the target hash, so the
// owner-scoped path always misses first and the fallback is what's under test.
describe("getMetadata — PD-107 roster-avatar reference-check", () => {
  // Seeds: `charOwner` owns a character whose avatar is a stored PNG; `caller` is a separate user. Returns
  // the pieces each case tweaks. The chat + rosterings are seeded per-case (they're what varies).
  async function seedAvatar(db: Db, h: AssetsHarness): Promise<AvatarScenario> {
    const charOwner = await seedUser(db, { handle: "char_owner" });
    const caller = await seedUser(db, { handle: "caller" });
    const svc = createAssetsService(h.ctx);
    const avatar = await svc.store({
      principal: principal(charOwner),
      bytes: pngBytes(10, 20, 30),
      kind: "avatar",
      mime: PNG,
    });
    const character = await seedCharacter(db, charOwner, { handle: "hero" });
    await setCharacterAvatar(db, character, avatar.assetId);
    return { svc, charOwner, caller, character, avatarHash: avatar.hash, avatarSize: avatar.size };
  }

  test("caller present in a chat rostering the character → resolves to the ASSET owner", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    const chat = await seedChatRow(db, "chat_shared");
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: s.caller, role: "host" });
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: s.character });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: s.avatarHash });
    expect(meta).toEqual({ mime: PNG, size: s.avatarSize, ownerId: s.charOwner });
  });

  test("(a) a co-participant's NON-avatar asset (card) with a known hash → undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    // The char-owner also stores a CARD asset (not referenced by any `avatarAssetId`) — the oracle a probe
    // would exploit. It must NOT resolve even though the users share a present chat.
    const card = await s.svc.store({
      principal: principal(s.charOwner),
      bytes: pngBytes(99, 98, 97),
      kind: "card",
      mime: PNG,
    });
    const chat = await seedChatRow(db, "chat_shared");
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: s.caller, role: "host" });
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: s.character });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: card.hash });
    expect(meta).toBeUndefined();
  });

  test("(b) the character's avatar, but caller is NOT a member of that chat → undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    // The character is rostered in a chat the caller is NOT in.
    const chat = await seedChatRow(db, "chat_elsewhere");
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: s.character });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: s.avatarHash });
    expect(meta).toBeUndefined();
  });

  test("(c) caller has LEFT the shared chat (leftSeq set) → undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    const chat = await seedChatRow(db, "chat_shared");
    await seedParticipant(db, chat, "human", {
      id: "cp_caller",
      userId: s.caller,
      role: "host",
      leftSeq: 5,
    });
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: s.character });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: s.avatarHash });
    expect(meta).toBeUndefined();
  });

  test("the character has LEFT the roster (its own leftSeq set) → undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    const chat = await seedChatRow(db, "chat_shared");
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: s.caller, role: "host" });
    await seedParticipant(db, chat, "character", {
      id: "cp_char",
      characterId: s.character,
      leftSeq: 7,
    });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: s.avatarHash });
    expect(meta).toBeUndefined();
  });

  test("(d) no match — a hash owned by nobody rostered → undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAvatar(db, h);
    const chat = await seedChatRow(db, "chat_shared");
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: s.caller, role: "host" });
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: s.character });

    const meta = await s.svc.getMetadata({ principal: principal(s.caller), hash: "a".repeat(64) });
    expect(meta).toBeUndefined();
  });
});
