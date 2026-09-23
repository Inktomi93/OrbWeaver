// invites.* — the output boundary of the five invite procedures that return data. `createInvite` returns
// the raw token exactly once beside the persisted `InviteView`; `previewInvite` returns the minimal
// pre-membership preview (room name, host handle, member count, mode label, no roster identities);
// `redeemInvite`/`acceptInvite` return the joined chat as the member's `ChatDetail` plus their own roster
// row; `listInvites` returns the host's `InviteView`s. Every procedure parses its result through a strict
// canonical schema, so a producer that starts returning an extra key (the peppered `tokenHash`, a spread
// row, a roster on the preview, an unconsented card description) fails the call instead of reaching the
// browser. Each leak test plants the extra field in the service result and drives the real ladder.

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, inviteResults, makeContext, principal } from "../_support.ts";

const HOST = castId<UserId>("user_host");
const JOINER = castId<UserId>("user_joiner");
const { inviteView: INVITE_VIEW, created: CREATED, preview: PREVIEW, joinerRow: JOINER_ROW, redeemed: REDEEMED } = inviteResults(JOINER);
const CHAT = REDEEMED.chat.id;
const INVITE = INVITE_VIEW.id;
const RAW_TOKEN = CREATED.token;
const TOKEN_HASH = "peppered-token-hash-must-stay-in-persistence";
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);

function ctxFor(userId: UserId, chat: Partial<ChatService>): Context {
  return makeContext({ auth: principal("user", { userId }), services: { chat } });
}

describe("invites — well-formed results pass through unchanged", () => {
  test("createInvite, previewInvite, redeemInvite, acceptInvite and listInvites", async () => {
    const chat: Partial<ChatService> = {
      createInvite: vi.fn<ChatService["createInvite"]>(async () => CREATED),
      previewInvite: vi.fn<ChatService["previewInvite"]>(async () => PREVIEW),
      redeemInvite: vi.fn<ChatService["redeemInvite"]>(async () => REDEEMED),
      acceptInvite: vi.fn<ChatService["acceptInvite"]>(async () => REDEEMED),
      listInvites: vi.fn<ChatService["listInvites"]>(async () => [INVITE_VIEW]),
    };
    const host = caller(ctxFor(HOST, chat));
    const joiner = caller(ctxFor(JOINER, chat));

    await expect(host.invites.createInvite({ chatId: CHAT, input: {} })).resolves.toEqual(CREATED);
    await expect(joiner.invites.previewInvite({ token: RAW_TOKEN })).resolves.toEqual(PREVIEW);
    await expect(joiner.invites.redeemInvite({ token: RAW_TOKEN })).resolves.toEqual(REDEEMED);
    await expect(joiner.invites.acceptInvite({ inviteId: INVITE })).resolves.toEqual(REDEEMED);
    await expect(host.invites.listInvites({ chatId: CHAT })).resolves.toEqual([INVITE_VIEW]);
  });
});

describe("invites — a result carrying a field the design does not allow is refused", () => {
  test("createInvite: the token hash riding on the invite view", async () => {
    const leaked = { ...CREATED, invite: { ...INVITE_VIEW, tokenHash: TOKEN_HASH } };
    const createInvite = vi.fn<ChatService["createInvite"]>(async () => leaked);

    await expect(caller(ctxFor(HOST, { createInvite })).invites.createInvite({ chatId: CHAT, input: {} })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("createInvite: a second secret beside the one raw token", async () => {
    const leaked = { ...CREATED, tokenHash: TOKEN_HASH };
    const createInvite = vi.fn<ChatService["createInvite"]>(async () => leaked);

    await expect(caller(ctxFor(HOST, { createInvite })).invites.createInvite({ chatId: CHAT, input: {} })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("previewInvite: roster identities on the pre-membership preview", async () => {
    const leaked = { ...PREVIEW, participants: [JOINER_ROW] };
    const previewInvite = vi.fn<ChatService["previewInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { previewInvite })).invites.previewInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("redeemInvite: the raw invite row beside the joined chat", async () => {
    const leaked = { ...REDEEMED, invite: { ...INVITE_VIEW, tokenHash: TOKEN_HASH } };
    const redeemInvite = vi.fn<ChatService["redeemInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { redeemInvite })).invites.redeemInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("redeemInvite: the raw chat metadata spread onto the chat detail", async () => {
    const leaked = { ...REDEEMED, chat: { ...REDEEMED.chat, metadata: { pendingHostSecret: TOKEN_HASH } } };
    const redeemInvite = vi.fn<ChatService["redeemInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { redeemInvite })).invites.redeemInvite({ token: RAW_TOKEN })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: a contact field on a roster row inside the chat detail", async () => {
    const leakedRow = { ...JOINER_ROW, email: "joiner@example.com" };
    const leaked = { ...REDEEMED, chat: { ...REDEEMED.chat, participants: [leakedRow] } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: an unconsented card description on a character identity", async () => {
    const leakedIdentity = { kind: "character" as const, id: CHARACTER_ID, name: "Aria", avatarHash: null, description: "the card's private notes" };
    const leaked = { ...REDEEMED, chat: { ...REDEEMED.chat, identities: [leakedIdentity] } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("acceptInvite: an extra field on the caller's own roster row", async () => {
    const leaked = { ...REDEEMED, participant: { ...JOINER_ROW, sessionToken: TOKEN_HASH } };
    const acceptInvite = vi.fn<ChatService["acceptInvite"]>(async () => leaked);

    await expect(caller(ctxFor(JOINER, { acceptInvite })).invites.acceptInvite({ inviteId: INVITE })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });

  test("listInvites: the token hash on a listed invite", async () => {
    const leaked = { ...INVITE_VIEW, tokenHash: TOKEN_HASH };
    const listInvites = vi.fn<ChatService["listInvites"]>(async () => [leaked]);

    await expect(caller(ctxFor(HOST, { listInvites })).invites.listInvites({ chatId: CHAT })).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });
});
