// invites.* — the output boundary of the five invite procedures that return data. `createInvite` returns
// the raw token exactly once beside the persisted `InviteView`; `previewInvite` returns the minimal
// pre-membership preview (room name, host handle, member count, mode label, no roster identities);
// `redeemInvite`/`acceptInvite` return the joined chat as the member's `ChatDetail` plus their own roster
// row; `listInvites` returns the host's `InviteView`s. Every procedure parses its result through a strict
// canonical schema, so a producer that starts returning an extra key (the peppered `tokenHash`, a spread
// row, a roster on the preview, an unconsented card description) fails the call instead of reaching the
// browser. Each leak test plants the extra field in the service result and drives the real ladder.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import type { Context } from "@orb/server/transport/trpc";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import { seatRoles } from "../../../domain/chat/_support.ts";
import { caller, inviteResults, makeContext, participantData, principal, redeemedData } from "../_support.ts";

const HOST = castId<UserId>("user_host");
const JOINER = castId<UserId>("user_joiner");
const { inviteView: INVITE_VIEW, created: CREATED, preview: PREVIEW, joinerRow: JOINER_ROW, redeemed: REDEEMED } = inviteResults(JOINER);
const CHAT = REDEEMED.chat.id;
// The chat service hands the router domain data: the same rows, seat roles as captured row data.
const ROLES = await seatRoles(await freshDb());
const REDEEMED_DATA = redeemedData(REDEEMED, ROLES);
const JOINER_ROW_DATA = participantData(JOINER_ROW, ROLES);
const INVITE = INVITE_VIEW.id;
const RAW_TOKEN = CREATED.token;
const TOKEN_HASH = "peppered-token-hash-must-stay-in-persistence";
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);

async function ctxFor(db: Db, userId: UserId, chat: Partial<ChatService>): Promise<Context> {
  return makeContext({ auth: await principal(db, "user", { userId }), services: { chat } });
}

describe("invites — well-formed results pass through unchanged", () => {
  test("createInvite, previewInvite, redeemInvite, acceptInvite and listInvites", async () => {
    const db = await freshDb();
    const chat: Partial<ChatService> = {
      createInvite: vi.fn<ChatService["createInvite"]>(async () => CREATED),
      previewInvite: vi.fn<ChatService["previewInvite"]>(async () => PREVIEW),
      redeemInvite: vi.fn<ChatService["redeemInvite"]>(async () => REDEEMED_DATA),
      acceptInvite: vi.fn<ChatService["acceptInvite"]>(async () => REDEEMED_DATA),
      listInvites: vi.fn<ChatService["listInvites"]>(async () => [INVITE_VIEW]),
    };
    const host = caller(await ctxFor(db, HOST, chat));
    const joiner = caller(await ctxFor(db, JOINER, chat));

    await expect(host.invites.createInvite({ chatId: CHAT, input: {} })).resolves.toEqual(CREATED);
    await expect(joiner.invites.previewInvite({ token: RAW_TOKEN })).resolves.toEqual(PREVIEW);
    await expect(joiner.invites.redeemInvite({ token: RAW_TOKEN })).resolves.toEqual(REDEEMED);
    await expect(joiner.invites.acceptInvite({ inviteId: INVITE })).resolves.toEqual(REDEEMED);
    await expect(host.invites.listInvites({ chatId: CHAT })).resolves.toEqual([INVITE_VIEW]);
  });
});

describe("invites — a result carrying a field the design does not allow is refused", () => {
  test("createInvite: the token hash riding on the invite view", async () => {
    const db = await freshDb();
    const leaked = { ...CREATED, invite: { ...INVITE_VIEW, tokenHash: TOKEN_HASH } };
    const createInvite = vi.fn<ChatService["createInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, HOST, { createInvite })).invites.createInvite({ chatId: CHAT, input: {} })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("createInvite: a second secret beside the one raw token", async () => {
    const db = await freshDb();
    const leaked = { ...CREATED, tokenHash: TOKEN_HASH };
    const createInvite = vi.fn<ChatService["createInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, HOST, { createInvite })).invites.createInvite({ chatId: CHAT, input: {} })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("previewInvite: roster identities on the pre-membership preview", async () => {
    const db = await freshDb();
    const leaked = { ...PREVIEW, participants: [JOINER_ROW] };
    const previewInvite = vi.fn<ChatService["previewInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { previewInvite })).invites.previewInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("redeemInvite: the raw invite row beside the joined chat", async () => {
    const db = await freshDb();
    const leaked = { ...REDEEMED_DATA, invite: { ...INVITE_VIEW, tokenHash: TOKEN_HASH } };
    const redeemInvite = vi.fn<ChatService["redeemInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { redeemInvite })).invites.redeemInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("redeemInvite: the raw chat metadata spread onto the chat detail", async () => {
    const db = await freshDb();
    const leaked = { ...REDEEMED_DATA, chat: { ...REDEEMED_DATA.chat, metadata: { pendingHostSecret: TOKEN_HASH } } };
    const redeemInvite = vi.fn<ChatService["redeemInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { redeemInvite })).invites.redeemInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: a contact field on a roster row inside the chat detail", async () => {
    const db = await freshDb();
    const leakedRow = { ...JOINER_ROW_DATA, email: "joiner@example.com" };
    const leaked = { ...REDEEMED_DATA, chat: { ...REDEEMED_DATA.chat, participants: [leakedRow] } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: an unconsented card description on a character identity", async () => {
    const db = await freshDb();
    const leakedIdentity = { kind: "character" as const, id: CHARACTER_ID, name: "Aria", avatarHash: null, description: "the card's private notes" };
    const leaked = { ...REDEEMED_DATA, chat: { ...REDEEMED_DATA.chat, identities: [leakedIdentity] } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: an extra field on the caller's own roster row", async () => {
    const db = await freshDb();
    const leaked = { ...REDEEMED_DATA, participant: { ...JOINER_ROW_DATA, sessionToken: TOKEN_HASH } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(await ctxFor(db, JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("listInvites: the token hash on a listed invite", async () => {
    const db = await freshDb();
    const leaked = { ...INVITE_VIEW, tokenHash: TOKEN_HASH };
    const listInvites = vi.fn<ChatService["listInvites"]>(async () => [leaked]);

    await expect(caller(await ctxFor(db, HOST, { listInvites })).invites.listInvites({ chatId: CHAT })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });
});
