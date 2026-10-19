// domain/chat co-participant asset checks — the production queries, per case: a seated caller reaches the other member's asset, while
// an unseated caller and a caller who left the room reach nothing.
// @subject packages/server/src/domain/chat/persistence/co-participant-assets.ts

import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AssetId, CharacterHandle, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { createLoadChatAssetRefs, createLoadCoParticipantOwner } from "@orb/server/domain/chat";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, onTestFinished } from "vitest";
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
} from "../../assets/_support.ts";

const PNG = "image/png";
const LEFT_SEQ = 5;

// Where the caller sits: in the asset's room (a `leftSeq` marks a caller who left it), only in a second room
// the owner also sits in, or nowhere (`null`).
type CallerSeat = { readonly room: "shared"; readonly leftSeq?: number } | { readonly room: "other" } | null;
const SEATED: CallerSeat = { room: "shared" };
const DEPARTED: CallerSeat = { room: "shared", leftSeq: LEFT_SEQ };
const OTHER_ROOM: CallerSeat = { room: "other" };

interface Case {
  readonly name: string;
  /** Links `assetId` (owned by `owner`) into `chat` through this case's reference, seating the owner as needed. */
  readonly link: (db: Db, chat: ChatId, owner: UserId, assetId: AssetId) => Promise<void>;
}

const ATTACHMENT: Case = {
  name: "message attachment",
  link: async (db, chat, owner, assetId) => {
    const message = await seedMessage(db, chat, { id: "message_att" });
    await seedMessageAsset(db, message, assetId);
    await seedParticipant(db, chat, "human", { id: "cp_owner", userId: owner, role: "host" });
  },
};

function personaCase(ownerLeftSeq?: number): Case {
  return {
    name: "co-participant active persona avatar",
    link: async (db, chat, owner, assetId): Promise<void> => {
      const persona = await seedPersona(db, owner, { name: "Alter" });
      await setPersonaAvatar(db, persona, assetId);
      await seedParticipant(db, chat, "human", {
        id: "cp_owner",
        userId: owner,
        role: "host",
        activePersonaId: persona,
        ...(ownerLeftSeq === undefined ? {} : { leftSeq: ownerLeftSeq }),
      });
    },
  };
}

const CASES: readonly Case[] = [
  {
    name: "rostered character avatar",
    link: async (db, chat, owner, assetId) => {
      const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
      await setCharacterAvatar(db, character, assetId);
      await seedParticipant(db, chat, "character", { id: "cp_char", characterId: character });
    },
  },
  personaCase(),
  ATTACHMENT,
];

interface Seeded {
  readonly db: Db;
  readonly owner: UserId;
  readonly caller: UserId;
  readonly chat: ChatId;
  readonly assetId: AssetId;
  readonly hash: string;
}

async function seedCase(c: Case, seat: CallerSeat): Promise<Seeded> {
  const db = await freshDb();
  const h = await makeHarness(db);
  onTestFinished(h.cleanup);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = await seedUser(db, { handle: castId<Handle>("caller") });
  const asset = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(1, 2, 3), kind: "avatar", mime: PNG });
  const chat = await seedChatRow(db, "chat_shared");
  await c.link(db, chat, owner, asset.assetId);
  if (seat?.room === "shared") {
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: caller, ...(seat.leftSeq === undefined ? {} : { leftSeq: seat.leftSeq }) });
  } else if (seat?.room === "other") {
    const other = await seedChatRow(db, "chat_other");
    await seedParticipant(db, other, "human", { id: "cp_owner_other", userId: owner, role: "host" });
    await seedParticipant(db, other, "human", { id: "cp_caller_other", userId: caller });
  }
  return { db, owner, caller, chat, assetId: asset.assetId, hash: asset.hash };
}

async function ownerFor(c: Case, seat: CallerSeat): Promise<{ readonly owner: UserId; readonly resolved: UserId | undefined }> {
  const s = await seedCase(c, seat);
  return { owner: s.owner, resolved: await createLoadCoParticipantOwner({ db: databaseHandle(s.db) })(s.caller, s.hash) };
}

async function chatRefsFor(seat: CallerSeat): Promise<{ readonly assetId: AssetId; readonly refs: readonly AssetId[] }> {
  const s = await seedCase(ATTACHMENT, seat);
  const refs = await createLoadChatAssetRefs({ db: databaseHandle(s.db) })(s.caller, s.chat, [s.assetId]);
  return { assetId: s.assetId, refs: refs.map((ref) => ref.assetId) };
}

describe("createLoadCoParticipantOwner", () => {
  for (const c of CASES) {
    test(`${c.name}: a seated caller resolves the asset owner`, async () => {
      const { owner, resolved } = await ownerFor(c, SEATED);
      expect(resolved).toBe(owner);
    });

    test(`${c.name}: a caller with no seat resolves nothing`, async () => {
      expect((await ownerFor(c, null)).resolved).toBeUndefined();
    });

    test(`${c.name}: a caller who left the room resolves nothing`, async () => {
      expect((await ownerFor(c, DEPARTED)).resolved).toBeUndefined();
    });

    test(`${c.name}: a caller seated only in another room shared with the owner resolves nothing`, async () => {
      expect((await ownerFor(c, OTHER_ROOM)).resolved).toBeUndefined();
    });
  }

  test("a persona whose owner left the room resolves nothing for a seated caller", async () => {
    expect((await ownerFor(personaCase(LEFT_SEQ), SEATED)).resolved).toBeUndefined();
  });
});

describe("createLoadChatAssetRefs", () => {
  test("a seated caller resolves the co-participant's attachment in that chat", async () => {
    const { assetId, refs } = await chatRefsFor(SEATED);
    expect(refs).toEqual([assetId]);
  });

  test("a caller with no seat resolves nothing", async () => {
    expect((await chatRefsFor(null)).refs).toEqual([]);
  });

  test("a caller who left the room resolves nothing", async () => {
    expect((await chatRefsFor(DEPARTED)).refs).toEqual([]);
  });

  test("a caller seated only in another room shared with the owner resolves nothing", async () => {
    expect((await chatRefsFor(OTHER_ROOM)).refs).toEqual([]);
  });
});

/** The attachment reference with its OWNER's seat closed: the asset stays linked into the room, its owner left. */
const ATTACHMENT_OWNER_LEFT: Case = {
  name: "message attachment whose owner left",
  link: async (db, chat, owner, assetId) => {
    const message = await seedMessage(db, chat, { id: "message_att" });
    await seedMessageAsset(db, message, assetId);
    await seedParticipant(db, chat, "human", { id: "cp_owner", userId: owner, role: "host", leftSeq: LEFT_SEQ });
  },
};

/** The owner's persona held active by a CHARACTER seat only: no human seat consents to its presentation. */
const PERSONA_ON_CHARACTER_SEAT: Case = {
  name: "persona held only by a character seat",
  link: async (db, chat, owner, assetId) => {
    const persona = await seedPersona(db, owner, { name: "Alter" });
    await setPersonaAvatar(db, persona, assetId);
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("bystander") });
    await seedParticipant(db, chat, "human", { id: "cp_owner", userId: owner, role: "host" });
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: character, activePersonaId: persona });
  },
};

describe("the owner side of every arm", () => {
  test("an attachment whose owner LEFT the room resolves no owner and no chat ref for a seated caller", async () => {
    expect((await ownerFor(ATTACHMENT_OWNER_LEFT, SEATED)).resolved).toBeUndefined();
    const s = await seedCase(ATTACHMENT_OWNER_LEFT, SEATED);
    expect(await createLoadChatAssetRefs({ db: databaseHandle(s.db) })(s.caller, s.chat, [s.assetId])).toEqual([]);
  });

  test("a persona only a CHARACTER seat holds active lends its avatar to nobody", async () => {
    expect((await ownerFor(PERSONA_ON_CHARACTER_SEAT, SEATED)).resolved).toBeUndefined();
  });

  test("the character arm answers before the persona arm when one hash backs both", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const characterOwner = await seedUser(db, { handle: castId<Handle>("char_owner") });
    const personaOwner = await seedUser(db, { handle: castId<Handle>("persona_owner") });
    const caller = await seedUser(db, { handle: castId<Handle>("caller") });
    const assets = createAssetsService(h.ctx);
    const characterArt = await assets.store({ principal: principal(characterOwner), bytes: pngBytes(1, 2, 3), kind: "avatar", mime: PNG });
    const personaArt = await assets.store({ principal: principal(personaOwner), bytes: pngBytes(1, 2, 3), kind: "avatar", mime: PNG });
    expect(personaArt.hash).toBe(characterArt.hash);
    const chat = await seedChatRow(db, "chat_shared");
    const character = await seedCharacter(db, characterOwner, { handle: castId<CharacterHandle>("hero") });
    await setCharacterAvatar(db, character, characterArt.assetId);
    const persona = await seedPersona(db, personaOwner, { name: "Alter" });
    await setPersonaAvatar(db, persona, personaArt.assetId);
    await seedParticipant(db, chat, "character", { id: "cp_char", characterId: character });
    await seedParticipant(db, chat, "human", { id: "cp_persona_owner", userId: personaOwner, role: "host", activePersonaId: persona });
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: caller });

    expect(await createLoadCoParticipantOwner({ db: databaseHandle(db) })(caller, characterArt.hash)).toBe(characterOwner);
  });
});
