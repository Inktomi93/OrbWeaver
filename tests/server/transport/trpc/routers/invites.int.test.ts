// invites.* over the REAL composed graph — the positive half of the strict output parsers. The unit file
// (`invites.test.ts`) proves each parser refuses a planted key; this one proves the parsers accept what the
// real producers return, so a strict schema that drifted narrower than its producer fails here instead of
// failing a join in production after the participant insert committed.
//
// The room is seeded the way production leaves one: minted ids, a host seat, a character seat whose card
// carries a theme and a background, and chat metadata with a group config and a background. The character's
// background blob also carries a retired key (`seededId`) the seeded-background migration rewrites; the
// carried-blob schemas strip it, so a stale card cannot fail a join and the key never reaches the joiner.

import "../../../../support/composed-real.ts";
import { groupConfigSchema } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import { chatParticipants } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { guestModeSentence } from "../../../../../packages/server/src/domain/chat/verbs/invite-preview.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { ADMIN_USER_ID, expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures.ts";

const CARD_BACKGROUND: ThemeBackground = {
  kind: "external",
  externalUrl: "https://example.com/ruins.png",
  assetId: "",
  assetHash: "",
  mime: "",
  provenanceUrl: "",
};
const RETIRED_BACKGROUND_KEY = "seededId";
// A card background written before the seeded-background migration: the stored blob is untyped JSON, so the
// retired key survives in the column until that migration reaches the row.
const LEGACY_CARD_BACKGROUND = { ...CARD_BACKGROUND, [RETIRED_BACKGROUND_KEY]: "ruins-dusk" };

async function seedHostedRoom(db: Parameters<typeof seedChat>[0]): Promise<ReturnType<typeof mintTypeId<typeof ID_PREFIX.chat>>> {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await seedChat(db, {
    id: chatId,
    title: "The Ruins",
    metadata: { group: groupConfigSchema.parse({ output: "narrator", policy: "natural" }), background: CARD_BACKGROUND },
  });
  const card = await seedCharacter(db, {
    ownerId: OWNER_USER_ID,
    name: "Aria",
    themeOverride: { accent: "#336699" },
    backgroundOverride: LEGACY_CARD_BACKGROUND,
  });
  await db.insert(chatParticipants).values([
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "human", userId: OWNER_USER_ID, role: "host", joinedAt: FROZEN_AT_MS, joinSeq: 0 },
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "character", characterId: card.id, role: "member", joinedAt: FROZEN_AT_MS, joinSeq: 0 },
  ]);
  return chatId;
}

describe("invites — the strict output parsers accept the real producers", () => {
  test("share link: create → list → preview → redeem → redeem again", async ({ db, ownerCaller, otherCaller }) => {
    const chatId = await seedHostedRoom(db);

    const created = await ownerCaller.invites.createInvite({ chatId, input: {} });
    expect(Object.keys(created).sort()).toEqual(["invite", "token"]);
    expect(created.invite).toMatchObject({ chatId, status: "pending", invitedUserId: null });

    await expect(ownerCaller.invites.listInvites({ chatId })).resolves.toEqual([created.invite]);

    const preview = await otherCaller.invites.previewInvite({ token: created.token });
    expect(preview).toEqual({
      chatId,
      roomName: "The Ruins",
      hostHandle: "fixture-owner",
      memberCount: 1,
      modeLabel: guestModeSentence({ output: "narrator", policy: "natural" }),
    });

    const joined = await otherCaller.invites.redeemInvite({ token: created.token });
    expect(joined.participant).toMatchObject({ userId: OTHER_USER_ID, role: "member", kind: "human" });
    expect(joined.chat.participants.map((p) => p.kind).sort()).toEqual(["character", "human", "human"]);
    const cardSeat = joined.chat.participants.find((p) => p.kind === "character");
    expect(cardSeat?.themeOverride).toEqual({ accent: "#336699" });
    expect(cardSeat?.backgroundOverride).toEqual(CARD_BACKGROUND);
    expect(cardSeat?.backgroundOverride).not.toHaveProperty(RETIRED_BACKGROUND_KEY);
    expect(joined.chat.identities).toEqual([expect.objectContaining({ kind: "character", name: "Aria" })]);

    // The already-member recovery arm returns the same shape through the same parser.
    const again = await otherCaller.invites.redeemInvite({ token: created.token });
    expect(again.chat.id).toBe(chatId);
  });

  test("targeted invite: create by handle → accept by id", async ({ db, ownerCaller, adminCaller }) => {
    const chatId = await seedHostedRoom(db);

    const created = await ownerCaller.invites.createInvite({ chatId, input: { invitedHandle: castId<Handle>("fixture-admin") } });
    expect(created.invite.invitedUserId).toBe(ADMIN_USER_ID);

    const accepted = await adminCaller.invites.acceptInvite({ inviteId: created.invite.id });
    expect(accepted.participant).toMatchObject({ userId: ADMIN_USER_ID, role: "member" });
    expect(accepted.chat.viewerUserId).toBe(ADMIN_USER_ID);
  });
});
