// The production co-participant queries, per case: a seated caller reaches the other member's asset, while
// an unseated caller and a caller who left the room reach nothing.

import type { Db } from "@orb/db";
import type { AssetId, CharacterHandle, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { createLoadChatAssetRefs, createLoadCoParticipantOwner } from "../../../../packages/server/src/entry/compose/co-participant-assets.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
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
} from "../../domain/assets/_support.ts";

const PNG = "image/png";
const LEFT_SEQ = 5;

// The caller's seat in the room: `null` is no seat; a `leftSeq` marks a caller who left.
type CallerSeat = { readonly leftSeq?: number } | null;
const SEATED: CallerSeat = {};
const DEPARTED: CallerSeat = { leftSeq: LEFT_SEQ };

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

const CASES: readonly Case[] = [
  {
    name: "rostered character avatar",
    link: async (db, chat, owner, assetId) => {
      const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
      await setCharacterAvatar(db, character, assetId);
      await seedParticipant(db, chat, "character", { id: "cp_char", characterId: character });
    },
  },
  {
    name: "co-participant active persona avatar",
    link: async (db, chat, owner, assetId) => {
      const persona = await seedPersona(db, owner, { name: "Alter" });
      await setPersonaAvatar(db, persona, assetId);
      await seedParticipant(db, chat, "human", { id: "cp_owner", userId: owner, role: "host", activePersonaId: persona });
    },
  },
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
  if (seat !== null) {
    await seedParticipant(db, chat, "human", { id: "cp_caller", userId: caller, ...seat });
  }
  return { db, owner, caller, chat, assetId: asset.assetId, hash: asset.hash };
}

async function ownerFor(c: Case, seat: CallerSeat): Promise<{ readonly owner: UserId; readonly resolved: UserId | undefined }> {
  const s = await seedCase(c, seat);
  return { owner: s.owner, resolved: await createLoadCoParticipantOwner(s.db)(s.caller, s.hash) };
}

async function chatRefsFor(seat: CallerSeat): Promise<{ readonly assetId: AssetId; readonly refs: readonly AssetId[] }> {
  const s = await seedCase(ATTACHMENT, seat);
  const refs = await createLoadChatAssetRefs(s.db)(s.caller, s.chat, [s.assetId]);
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
  }
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
});
