// @subject packages/server/src/entry/http/card-frame.ts
// A routed card's grants are read again on every serve: a member mints a trusted, interactive card that may load
// external media, then one grant is withdrawn between the mint and the serve, and the served policy loses exactly
// that grant. A grant added after the mint never reaches the handle, and a forming mint (a panel of a reply still
// streaming) is capped at the static posture with no external media for its whole life. A viewer's script consent is read off their stored
// settings, and a blob this build cannot read faithfully is no consent at all (D294). A mint that carries another
// character's stylesheets loads external media only while that character allows it too, at mint and on every serve
// (UI-Theming-and-Content §12.2). A character's own Interactive step runs scripts under any "Default for characters",
// while an inheriting character takes the default (D294). Everything runs over the real HTTP entry.
import type { CardFrameMintRequest } from "@orb/contracts/chat";
import { CARD_FRAME_CARRIED_AUTHORS_MAX, CARD_FRAME_ROUTE, cardFrameMintResponseSchema, renderPolicyOverrideForStep } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import type { CardFrameMediaPolicy, CardFramePosture } from "@orb/kit/card-frame";
import { buildCardFrameCsp, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { plantForeignSettingsBytes, plantForeignSettingsValue } from "@orb/testkit/node/composed";
import type { z } from "zod";

type Caller = Awaited<ReturnType<AuthModeRoot["internalCallerFor"]>>;
type Granted = z.infer<typeof cardFrameMintResponseSchema>["granted"];

const POLICY = "content-security-policy";
const CARD_HTML = "<p>tide tables</p>";
const ALL_MEDIA: CardFrameMediaPolicy = { allowExternalMedia: true, allowInlineData: true };

interface GrantedRoom {
  readonly root: AuthModeRoot;
  readonly host: Caller;
  readonly member: SignedIn;
  readonly memberCaller: Caller;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

/** A room the box owner hosts, seating one character on "Inherit default", with a signed-in member. External media is
 *  allowed on the box, so the character's mint carries every grant. */
async function grantedRoom(root: AuthModeRoot): Promise<GrantedRoom> {
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true, forbidExternalMedia: false } });
  // Internal callers capture one request's capability, so they are taken after the switch.
  const host = await root.internalCallerFor(root.ownerId);
  const card = await host.character.create({ input: { handle: "tide-keeper", name: "Tide Keeper", description: "Keeps the tables." } });
  const { chat } = await host.chat.startChat({ characterIds: [card.id] });
  const memberSubject = await mintMember(root);
  const memberCaller = await root.internalCallerFor(memberSubject.userId);
  const invite = await host.invites.createInvite({ chatId: chat.id, input: {} });
  await memberCaller.invites.redeemInvite({ token: invite.token });
  const member = await signIn(root, memberSubject);
  return { root, host, member, memberCaller, chatId: chat.id, characterId: card.id };
}

async function postMint(room: GrantedRoom, extra: Readonly<Record<string, unknown>> = {}): Promise<Response> {
  return await room.root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: { ...room.member.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ chatId: room.chatId, characterId: room.characterId, html: CARD_HTML, ...extra }),
  });
}

async function mint(
  room: GrantedRoom,
  request: Pick<CardFrameMintRequest, "forming" | "carriedFrom"> = {},
): Promise<{ readonly url: string; readonly granted: Granted }> {
  const response = await postMint(room, request);
  expect(response.status).toBe(200);
  return cardFrameMintResponseSchema.parse(await response.json());
}

async function servedPolicy(room: GrantedRoom, url: string): Promise<string | null> {
  const response = await room.root.http.request(url, { headers: room.member.headers });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(CARD_HTML);
  return response.headers.get(POLICY);
}

/** Mint with every grant and prove the first serve carries them all, so a narrowed serve is a withdrawal. */
async function mintWithEveryGrant(room: GrantedRoom): Promise<string> {
  const minted = await mint(room);
  expect(minted.granted).toEqual({ externalMedia: true, inlineData: true, interactive: true });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "interactive"));
  return minted.url;
}

interface Withdrawal {
  readonly withdraw: (room: GrantedRoom) => Promise<void>;
  readonly media: CardFrameMediaPolicy;
  readonly posture: CardFramePosture;
}

const WITHDRAWALS: Readonly<Record<string, Withdrawal>> = {
  "the host lowers the character to Render HTML": {
    withdraw: async ({ host, characterId }) => {
      await host.character.update({ characterId, input: { trustHtml: true, interactiveHtml: false } });
    },
    media: ALL_MEDIA,
    posture: "static",
  },
  "the host lowers the character to Untrusted": {
    withdraw: async ({ host, characterId }) => {
      await host.character.update({ characterId, input: { trustHtml: false, interactiveHtml: false } });
    },
    media: { allowExternalMedia: true, allowInlineData: false },
    posture: "static",
  },
  "the host forbids the character's external media": {
    withdraw: async ({ host, characterId }) => {
      await host.character.update({ characterId, input: { forbidExternalMedia: true } });
    },
    media: { allowExternalMedia: false, allowInlineData: true },
    posture: "interactive",
  },
  "the admin blocks external media on the box": {
    withdraw: async ({ host }) => {
      await host.settings.updateAppSettings({ partial: { forbidExternalMedia: true } });
    },
    media: { allowExternalMedia: false, allowInlineData: true },
    posture: "interactive",
  },
  "the admin sets the default for characters below Interactive": {
    withdraw: async ({ host }) => {
      await host.settings.updateAppSettings({ partial: { defaultHtmlStep: "trusted" } });
    },
    media: ALL_MEDIA,
    posture: "static",
  },
  "the viewer turns card scripts off": {
    withdraw: async ({ memberCaller }) => {
      await memberCaller.settings.updateUserSettingsSection({ section: "chat", patch: { runCardScripts: false } });
    },
    media: ALL_MEDIA,
    posture: "static",
  },
  "the host removes the viewer from the room": {
    withdraw: async ({ host, chatId, member }) => {
      await host.invites.kick({ chatId, userId: member.userId });
    },
    media: CARD_FRAME_SAFE_FLOOR,
    posture: "static",
  },
};

test.for(Object.entries(WITHDRAWALS))("%s between mint and serve narrows the served policy to what remains", async ([, withdrawal]) => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  const url = await mintWithEveryGrant(room);
  await withdrawal.withdraw(room);
  expect(await servedPolicy(room, url)).toBe(buildCardFrameCsp(withdrawal.media, "document", withdrawal.posture));
});

test("a character set to Interactive runs scripts under a lower default, and only the viewer's switch holds them", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await room.host.character.update({ characterId: room.characterId, input: renderPolicyOverrideForStep("interactive") });
  await room.host.settings.updateAppSettings({ partial: { defaultHtmlStep: "trusted" } });
  const minted = await mint(room);
  expect(minted.granted).toEqual({ externalMedia: true, inlineData: true, interactive: true });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "interactive"));
  // The default dropping further after the mint does not reach a character with its own step.
  await room.host.settings.updateAppSettings({ partial: { defaultHtmlStep: "untrusted" } });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "interactive"));
  await room.memberCaller.settings.updateUserSettingsSection({ section: "chat", patch: { runCardScripts: false } });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "static"));
});

test("an inheriting character under a Rich HTML default runs no scripts until its own step is Interactive", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await room.host.settings.updateAppSettings({ partial: { defaultHtmlStep: "trusted" } });
  const inherited = await mint(room);
  expect(inherited.granted).toEqual({ externalMedia: true, inlineData: true, interactive: false });
  expect(await servedPolicy(room, inherited.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "static"));
  // Positive control: the same room and default, with the character's own step at Interactive, mints scripts.
  await room.host.character.update({ characterId: room.characterId, input: renderPolicyOverrideForStep("interactive") });
  expect((await mint(room)).granted).toEqual({ externalMedia: true, inlineData: true, interactive: true });
});

test("a member cannot set the host's character to Interactive, so a Rich HTML default still holds its scripts", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await room.host.settings.updateAppSettings({ partial: { defaultHtmlStep: "trusted" } });
  await expect(room.memberCaller.character.update({ characterId: room.characterId, input: renderPolicyOverrideForStep("interactive") })).toThrowTRPCError(
    "NOT_FOUND",
  );
  expect((await mint(room)).granted).toEqual({ externalMedia: true, inlineData: true, interactive: false });
});

test("a grant given after the mint never reaches the handle minted without it", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await room.host.character.update({ characterId: room.characterId, input: { forbidExternalMedia: true } });
  const minted = await mint(room);
  expect(minted.granted).toEqual({ externalMedia: false, inlineData: true, interactive: true });
  await room.host.character.update({ characterId: room.characterId, input: { forbidExternalMedia: false } });
  // A fresh mint now carries the grant, so the setting really is back on.
  expect((await mint(room)).granted.externalMedia).toBe(true);
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "interactive"));
});

test("a viewer who turned card scripts off keeps them off when another field of their settings is unreadable", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await mintWithEveryGrant(room);
  await room.memberCaller.settings.updateUserSettingsSection({ section: "chat", patch: { runCardScripts: false } });
  // A blob another build wrote: one blacklist entry this build's schema refuses, so the whole blob reads as defaults.
  await plantForeignSettingsValue(root, room.member.userId, "$.chat.autoSwipe.blacklist", ["ok", 7]);
  const view = await room.memberCaller.settings.getUserSettings();
  expect(view.configUnreadable).toBe(VERSIONED_PARSE_FAILURES.schemaRejected);
  // The stand-in default is ON, and it is not this viewer's answer.
  expect(view.config.chat.runCardScripts).toBe(true);
  const minted = await mint(room);
  expect(minted.granted).toEqual({ externalMedia: true, inlineData: true, interactive: false });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "static"));
});

test("a viewer whose stored settings are not JSON still gets the card, static", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  await mintWithEveryGrant(room);
  await room.memberCaller.settings.updateUserSettingsSection({ section: "profile", patch: { flankCollapsed: true } });
  await plantForeignSettingsBytes(root, room.member.userId, '{"chat": {"runCardScripts": tr');
  expect((await room.memberCaller.settings.getUserSettings()).configUnreadable).toBe(VERSIONED_PARSE_FAILURES.notJson);
  const minted = await mint(room);
  expect(minted.granted).toEqual({ externalMedia: true, inlineData: true, interactive: false });
  expect(await servedPolicy(room, minted.url)).toBe(buildCardFrameCsp(ALL_MEDIA, "document", "static"));
});

test("a forming mint of a card with every grant serves static with no external media, and no serve lifts the cap", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  // Positive control: the same bytes minted as settled carry every grant.
  await mintWithEveryGrant(room);
  const forming = await mint(room, { forming: true });
  expect(forming.granted).toEqual({ externalMedia: false, inlineData: true, interactive: false });
  const capped = buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "static");
  expect(await servedPolicy(room, forming.url)).toBe(capped);
  // Every grant is still current on the box, so a serve re-resolving the selector alone would widen; the stored cap holds.
  expect((await mint(room)).granted).toEqual({ externalMedia: true, inlineData: true, interactive: true });
  expect(await servedPolicy(room, forming.url)).toBe(capped);
});

test("a forming flag other than true is refused, so the field can only narrow a mint", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  for (const forming of [false, "true", 1, null]) {
    expect((await postMint(room, { forming })).status, JSON.stringify(forming)).toBe(400);
  }
  // Positive control: the same request without the flag mints.
  expect((await postMint(room)).status).toBe(200);
});

/** A second character seated in the room, whose stylesheets a later reply of the first may carry. */
async function seatAuthor(room: GrantedRoom, input: { readonly forbidExternalMedia: boolean }): Promise<CharacterId> {
  const card = await room.host.character.create({ input: { handle: "lamp-keeper", name: "Lamp Keeper", description: "Keeps the lamps." } });
  await room.host.character.update({ characterId: card.id, input });
  await room.host.chat.addCharacterToChat({ chatId: room.chatId, characterId: card.id });
  return card.id;
}

test("a mint carrying the stylesheet of a character who forbids external media loads none, on every serve", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  const author = await seatAuthor(room, { forbidExternalMedia: true });
  // Positive control: the same bytes with no carried author load external media.
  await mintWithEveryGrant(room);
  const carrying = await mint(room, { carriedFrom: [author] });
  expect(carrying.granted).toEqual({ externalMedia: false, inlineData: true, interactive: true });
  expect(await servedPolicy(room, carrying.url)).toBe(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "interactive"));
});

test("a carried author who forbids external media after the mint narrows the next serve", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  const author = await seatAuthor(room, { forbidExternalMedia: false });
  const carrying = await mint(room, { carriedFrom: [author] });
  expect(carrying.granted).toEqual({ externalMedia: true, inlineData: true, interactive: true });
  await room.host.character.update({ characterId: author, input: { forbidExternalMedia: true } });
  expect(await servedPolicy(room, carrying.url)).toBe(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "interactive"));
});

test("a carried author the room does not seat allows no external media", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  const outsider = await room.host.character.create({ input: { handle: "far-keeper", name: "Far Keeper", description: "Keeps elsewhere." } });
  expect((await mint(room, { carriedFrom: [outsider.id] })).granted).toEqual({ externalMedia: false, inlineData: true, interactive: true });
});

test("a carried-author list that is empty or too long is refused, so the field can only narrow a mint", async () => {
  await using root = await createAuthModeRoot("local");
  const room = await grantedRoom(root);
  const tooMany = Array.from({ length: CARD_FRAME_CARRIED_AUTHORS_MAX + 1 }, () => room.characterId);
  for (const carriedFrom of [[], tooMany, ["not-a-character"]]) {
    expect((await postMint(room, { carriedFrom })).status, JSON.stringify(carriedFrom).slice(0, 40)).toBe(400);
  }
  // Positive control: one named author mints.
  expect((await postMint(room, { carriedFrom: [room.characterId] })).status).toBe(200);
});
