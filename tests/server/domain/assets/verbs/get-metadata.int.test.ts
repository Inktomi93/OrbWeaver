// verb: getMetadata — the owner-gated blob-serve gate (D21). Load-bearing: "not found" and "not yours"
// collapse into one answer (undefined → 404; no foreign-existence leak).

import type { Db } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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
  seedMessage,
  seedMessageAsset,
  seedParticipant,
  seedPersona,
  seedUser,
  setCharacterAvatar,
  setPersonaAvatar,
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

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
    const charOwner = await seedUser(db, { handle: castId<Handle>("char_owner") });
    const caller = await seedUser(db, { handle: castId<Handle>("caller") });
    const svc = createAssetsService(h.ctx);
    const avatar = await svc.store({
      principal: principal(charOwner),
      bytes: pngBytes(10, 20, 30),
      kind: "avatar",
      mime: PNG,
    });
    const character = await seedCharacter(db, charOwner, { handle: castId<CharacterHandle>("hero") });
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

// PD-28 widened (2026-07-07): the SIBLING persona arm — a multi-human group chat's OTHER member's persona
// avatar must resolve for co-participants too (not just a rostered character's), or their avatar 404s and
// falls back to initials. Same reference-check discipline: the join proves the asset IS that co-participant's
// CURRENT persona avatar, never a bare hash→owner oracle.
describe("getMetadata — PD-28 persona-sibling reference-check (multi-human group)", () => {
  test("a co-participant's persona avatar in a shared group chat resolves for the other member", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const personaOwner = await seedUser(db, { handle: castId<Handle>("persona_owner") });
    const caller = await seedUser(db, { handle: castId<Handle>("caller") });
    const avatar = await svc.store({
      principal: principal(personaOwner),
      bytes: pngBytes(11, 22, 33),
      kind: "avatar",
      mime: PNG,
    });
    const persona = await seedPersona(db, personaOwner, { name: "Alter Ego" });
    await setPersonaAvatar(db, persona, avatar.assetId);

    const chat = await seedChatRow(db, "chat_group_shared");
    await seedParticipant(db, chat, "human", {
      id: "cp_persona_owner",
      userId: personaOwner,
      role: "host",
      activePersonaId: persona,
    });
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: caller, role: "member" });

    const meta = await svc.getMetadata({ principal: principal(caller), hash: avatar.hash });
    expect(meta).toEqual({ mime: PNG, size: avatar.size, ownerId: personaOwner });
  });

  test("a persona avatar NOT sharing a chat with the caller still 404s (no leak)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const personaOwner = await seedUser(db, { handle: castId<Handle>("persona_owner_2") });
    const caller = await seedUser(db, { handle: castId<Handle>("caller_2") });
    const avatar = await svc.store({
      principal: principal(personaOwner),
      bytes: pngBytes(44, 55, 66),
      kind: "avatar",
      mime: PNG,
    });
    const persona = await seedPersona(db, personaOwner, { name: "Elsewhere" });
    await setPersonaAvatar(db, persona, avatar.assetId);

    // The persona-holder's chat does NOT include the caller.
    const chat = await seedChatRow(db, "chat_elsewhere_2");
    await seedParticipant(db, chat, "human", {
      id: "cp_persona_owner_2",
      userId: personaOwner,
      role: "host",
      activePersonaId: persona,
    });

    const meta = await svc.getMetadata({ principal: principal(caller), hash: avatar.hash });
    expect(meta).toBeUndefined();
  });
});

// #67 co-participant render — the ATTACHMENT arm of `loadCoParticipantOwner` (the blob byte-serve sibling of
// `resolveChatAssetRefs`). The blob route (`GET /api/blob/:hash`) calls getMetadata; the attachment arm must
// return the ASSET owner (so `cas.read(ownerId, hash)` hits the right partition) ONLY when the hash is
// STRUCTURALLY referenced by a `message_assets` row in a chat where BOTH the caller and the owner are present.
// Without this the render resolver hands a co-participant a hash the blob route still 404s.
describe("getMetadata — #67 attachment co-participant reference-check", () => {
  test("a present co-participant gets the attachment owner's metadata (blob route serves)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("att_owner") });
    const member = await seedUser(db, { handle: castId<Handle>("att_member") });
    const att = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(7, 7, 7),
      kind: "attachment",
      mime: PNG,
    });
    const chat = await seedChatRow(db, "chat_attach");
    const message = await seedMessage(db, chat, { id: "message_att", seq: 0 });
    await seedMessageAsset(db, message, att.assetId);
    await seedParticipant(db, chat, "human", { id: "cp_owner", userId: owner, role: "host" });
    await seedParticipant(db, chat, "human", { id: "cp_member", userId: member });

    const meta = await svc.getMetadata({ principal: principal(member), hash: att.hash });
    expect(meta).toEqual({ mime: PNG, size: att.size, ownerId: owner });
  });

  test("an OUTSIDER (not in the chat) gets undefined for the same attachment (404)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("att_owner_2") });
    const outsider = await seedUser(db, { handle: castId<Handle>("att_outsider") });
    const att = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(6, 6, 6),
      kind: "attachment",
      mime: PNG,
    });
    const chat = await seedChatRow(db, "chat_attach_2");
    const message = await seedMessage(db, chat, { id: "message_att_2", seq: 0 });
    await seedMessageAsset(db, message, att.assetId);
    await seedParticipant(db, chat, "human", { id: "cp_owner_2", userId: owner, role: "host" });
    // The outsider is NOT seated in this chat.

    const meta = await svc.getMetadata({ principal: principal(outsider), hash: att.hash });
    expect(meta).toBeUndefined();
  });

  test("structural, not membership: a co-participant's NON-attached asset → undefined (no oracle)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("att_owner_3") });
    const member = await seedUser(db, { handle: castId<Handle>("att_member_3") });
    // The owner stores an asset but never attaches it to a message in the shared chat — a co-participant must
    // NOT be able to probe its existence just by sharing a chat with the owner.
    const unattached = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5, 4, 3),
      kind: "attachment",
      mime: PNG,
    });
    const chat = await seedChatRow(db, "chat_attach_3");
    await seedParticipant(db, chat, "human", { id: "cp_owner_3", userId: owner, role: "host" });
    await seedParticipant(db, chat, "human", { id: "cp_member_3", userId: member });

    const meta = await svc.getMetadata({ principal: principal(member), hash: unattached.hash });
    expect(meta).toBeUndefined();
  });

  test("owner-present gate: once the owner leaves, the co-participant gets undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("att_owner_4") });
    const member = await seedUser(db, { handle: castId<Handle>("att_member_4") });
    const att = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2, 2, 2),
      kind: "attachment",
      mime: PNG,
    });
    const chat = await seedChatRow(db, "chat_attach_4");
    const message = await seedMessage(db, chat, { id: "message_att_4", seq: 0 });
    await seedMessageAsset(db, message, att.assetId);
    await seedParticipant(db, chat, "human", {
      id: "cp_owner_4",
      userId: owner,
      role: "host",
      leftSeq: 9,
    });
    await seedParticipant(db, chat, "human", { id: "cp_member_4", userId: member });

    const meta = await svc.getMetadata({ principal: principal(member), hash: att.hash });
    expect(meta).toBeUndefined();
  });
});
