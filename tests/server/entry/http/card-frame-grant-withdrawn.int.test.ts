// @subject packages/server/src/entry/http/card-frame.ts
// A routed card's grants are read again on every serve: a member mints a trusted, interactive card that may load
// external media, then one grant is withdrawn between the mint and the serve, and the served policy loses exactly
// that grant. A grant added after the mint never reaches the handle, and a forming mint (a panel of a reply still
// streaming) is capped at the static posture with no external media for its whole life. A viewer's script consent is read off their stored
// settings, and a blob this build cannot read faithfully is no consent at all (D294). Everything runs over the real HTTP
// entry.
import type { CardFrameMintRequest } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
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

async function mint(room: GrantedRoom, request: Pick<CardFrameMintRequest, "forming"> = {}): Promise<{ readonly url: string; readonly granted: Granted }> {
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
