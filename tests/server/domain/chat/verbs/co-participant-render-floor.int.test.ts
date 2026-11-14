// A member's render grant for another member's picture honors their own history floor and presence and the owner's
// consent (present and enabled), read through the real doors: the tRPC ref resolve and the signed-in blob route's
// original and every variant kind. A later quote never re-opens a pre-join picture; a disabled owner's art stops
// like a departed owner's; the room pin's persona avatar keeps serving while the pin holds. Art serves only while
// the room references it: a picture the room never names, a character off the roster, a persona put down and a
// link in another room grant nothing.
// @subject packages/server/src/domain/chat/verbs/load-chat-asset-refs.ts
// @subject packages/server/src/domain/chat/verbs/load-co-participant-owner.ts
// @subject packages/server/src/domain/chat/persistence/co-participant-assets.ts

import type { AssetKind, VariantKind } from "@orb/contracts/assets";
import { BLOB_ROUTE, variantKindSchema } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { createPersonaSchema } from "@orb/contracts/persona";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, ChatId, Handle, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedChatInvite,
  seedCorpusActors,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import { signedInMember } from "../../../entry/_auth-roots.ts";

const PNG = "image/png";
/** Any positive width snaps to a rung on every variant ladder, so this asks the `?w=` door rather than a size. */
const VARIANT_WIDTH = 64;
const OK = 200;
const NOT_FOUND = 404;

/** A room member with the cookie a real password login minted for them. */
interface Member {
  readonly principal: Principal;
  readonly cookie: string;
}

interface Picture {
  readonly assetId: AssetId;
  readonly hash: string;
}

interface Room {
  readonly root: ServerTestHarness;
  /** The box owner: the admin whose verb disables and re-enables an account. */
  readonly admin: Principal;
  /** A second account, so the admin can disable the room's host. */
  readonly host: Principal;
  readonly chatId: ChatId;
  /** The avatar of the host's character seated in the room. */
  readonly characterAvatar: Picture;
}

async function store(root: ServerTestHarness, owner: Principal, kind: AssetKind): Promise<Picture> {
  const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const assetId = (await root.services.assets.store({ principal: owner, bytes, kind, mime: PNG })).assetId;
  const hash = (await root.services.assets.assetCasRefById(assetId))?.hash;
  if (hash === undefined) {
    throw new Error("the stored picture has no CAS ref");
  }
  return { assetId, hash };
}

async function openRoom(): Promise<Room & AsyncDisposable> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      startJobs: false,
      providerFetch: wire.execute,
      env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
    }),
  );
  const { owner: admin, secondUserId } = await seedCorpusActors(root);
  const host = await root.principalFor(secondUserId);
  const characterAvatar = await store(root, host, "avatar");
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({
      handle: "floor-keeper",
      name: "Keeper",
      description: "A keeper of the room's pictures.",
      avatarAssetId: characterAvatar.assetId,
    }),
  });
  const room = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  const lifetime = construction.move();
  return { root, admin, host, chatId: room.chat.id, characterAvatar, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function admit(room: Room, handle: string, visibility: "full" | "from-join", chatId: ChatId = room.chatId): Promise<Member> {
  const signedIn = await signedInMember(room.root, castId<Handle>(handle));
  const guest = await room.root.principalFor(signedIn.id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId, userId: guest.userId, visibility });
  return { principal: guest, cookie: signedIn.cookie };
}

async function say(room: Room, as: Principal, content: string, attached: readonly AssetId[] = []): Promise<MessageId> {
  const message = (await room.root.services.chat.commitMessage({ principal: as, chatId: room.chatId, content, attachmentAssetIds: attached })).messages[0];
  if (message === undefined) {
    throw new Error("commitMessage returned no committed row");
  }
  return message.id;
}

function quote(assetId: AssetId): string {
  return contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId }, alt: "quoted" });
}

/** A persona `owner` owns, with its own avatar. */
async function personaWithAvatar(room: Room, owner: Principal, name: string): Promise<{ readonly personaId: PersonaId; readonly avatar: Picture }> {
  const avatar = await store(room.root, owner, "avatar");
  const persona = await room.root.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name, description: `${name}, played in the room.`, avatarAssetId: avatar.assetId }),
  });
  return { personaId: persona.id, avatar };
}

async function blobStatus(room: Room, viewer: Member, path: string): Promise<number> {
  const response = await room.root.http.request(path, { headers: { cookie: viewer.cookie } });
  await response.arrayBuffer();
  return response.status;
}

type ServedStatus = Readonly<{ original: number; variants: readonly (readonly [VariantKind, number])[] }>;

/** What the blob route answers the member for `hash`: the original, and the `?w=` variant of every kind. */
async function served(room: Room, viewer: Member, hash: string): Promise<ServedStatus> {
  const variants = await Promise.all(
    variantKindSchema.options.map(async (kind) => [kind, await blobStatus(room, viewer, `${BLOB_ROUTE}/${hash}?w=${VARIANT_WIDTH}&v=${kind}`)] as const),
  );
  return { original: await blobStatus(room, viewer, `${BLOB_ROUTE}/${hash}`), variants };
}

function everyRoute(status: number): ServedStatus {
  return { original: status, variants: variantKindSchema.options.map((kind) => [kind, status] as const) };
}

const SERVES = everyRoute(OK);
const REFUSES = everyRoute(NOT_FOUND);

/** What the member can render of an attachment: the routed chat ref resolve, and the blob routes by hash. */
async function renders(room: Room, viewer: Member, picture: Picture): Promise<ServedStatus & { readonly refs: AssetId[] }> {
  const caller = await room.root.internalCallerFor(viewer.principal.userId);
  const refs = await caller.assets.resolveChatBlobRefs({ chatId: room.chatId, assetIds: [picture.assetId] });
  return { refs: refs.map((ref) => ref.assetId), ...(await served(room, viewer, picture.hash)) };
}

const WITHHELD = { refs: [], ...REFUSES } as const;

function visible(picture: Picture): ServedStatus & { readonly refs: AssetId[] } {
  return { refs: [picture.assetId], ...SERVES };
}

async function setEnabled(room: Room, userId: UserId, enabled: boolean): Promise<void> {
  await room.root.services.admin.setEnabled({ principal: room.admin, userId, enabled });
}

test("a from-join member cannot render a pre-join picture through a later quote, while a full-history member and a post-join placement can", async () => {
  await using room = await openRoom();
  const picture = await store(room.root, room.host, "attachment");
  const placed = await say(room, room.host, "", [picture.assetId]);
  // The canon head at the join is inside a from-join floor, so the picture must sit strictly below it.
  await say(room, room.host, "The room moves on.");
  const joiner = await admit(room, "floor-joiner", "from-join");
  const founder = await admit(room, "floor-founder", "full");
  const joinerPage = await room.root.services.chat.listMessages({ principal: joiner.principal, chatId: room.chatId });
  expect(joinerPage.messages.map(({ id }) => id)).not.toContain(placed);

  await say(room, joiner.principal, `Remember this one? ${quote(picture.assetId)}`);

  expect(await renders(room, joiner, picture)).toEqual(WITHHELD);
  expect(await renders(room, founder, picture)).toEqual(visible(picture));

  await say(room, room.host, `Here it is again. ${quote(picture.assetId)}`);

  expect(await renders(room, joiner, picture)).toEqual(visible(picture));
});

test("a member who leaves the room loses the render of a picture they could see while present", async () => {
  await using room = await openRoom();
  const picture = await store(room.root, room.host, "attachment");
  await say(room, room.host, "", [picture.assetId]);
  const member = await admit(room, "floor-leaver", "full");
  expect(await renders(room, member, picture)).toEqual(visible(picture));

  await room.root.services.chat.selfLeave({ principal: member.principal, chatId: room.chatId });

  expect(await renders(room, member, picture)).toEqual(WITHHELD);
});

test("a disabled owner's character, persona and attachment art stops serving to the room on every route and serves again once re-enabled, while the pin holds its face", async () => {
  await using room = await openRoom();
  const seated = await personaWithAvatar(room, room.host, "Seated");
  const pinned = await personaWithAvatar(room, room.host, "Pinned");
  await room.root.services.persona.setActivePersona({ principal: room.host, chatId: room.chatId, personaId: seated.personaId });
  await room.root.services.chat.setChatAnchorPersona({ principal: room.host, chatId: room.chatId, personaId: pinned.personaId });
  const attachment = await store(room.root, room.host, "attachment");
  await say(room, room.host, "", [attachment.assetId]);
  const viewer = await admit(room, "floor-watcher", "full");

  const art = async (): Promise<readonly unknown[]> => [
    await served(room, viewer, room.characterAvatar.hash),
    await served(room, viewer, seated.avatar.hash),
    await renders(room, viewer, attachment),
    await served(room, viewer, pinned.avatar.hash),
  ];
  const allServed = [SERVES, SERVES, visible(attachment), SERVES];
  expect(await art()).toEqual(allServed);

  await setEnabled(room, room.host.userId, false);
  expect(await art()).toEqual([REFUSES, REFUSES, WITHHELD, SERVES]);
  // The pin's face serves to the room, never past it: an account seated only in a room of its own reads it as missing.
  const outsiderLogin = await signedInMember(room.root, castId<Handle>("floor-outsider"));
  const outsider = { principal: await room.root.principalFor(outsiderLogin.id), cookie: outsiderLogin.cookie };
  const ownCharacter = await room.root.services.character.create({
    principal: outsider.principal,
    input: createCharacterSchema.parse({ handle: "outsider-keeper", name: "Elsewhere", description: "A keeper of another room." }),
  });
  await room.root.services.chat.startChat({ principal: outsider.principal, characterIds: [ownCharacter.id], opening: "none" });
  expect(await served(room, outsider, pinned.avatar.hash)).toEqual(REFUSES);

  await setEnabled(room, room.host.userId, true);
  expect(await art()).toEqual(allServed);
});

test("a picture two players both hold keeps serving from the enabled one's copy when the other is disabled", async () => {
  await using room = await openRoom();
  const player = await admit(room, "floor-twin", "full");
  const viewer = await admit(room, "floor-onlooker", "full");
  // The same bytes under two owners are two asset rows with one hash, as when two accounts upload one picture.
  const bytes = makeAssetBytes(room.root.idSource.typeId(ID_PREFIX.asset));
  const avatarFor = async (owner: Principal, name: string): Promise<{ readonly personaId: PersonaId; readonly hash: string }> => {
    const stored = await room.root.services.assets.store({ principal: owner, bytes, kind: "avatar", mime: PNG });
    const persona = await room.root.services.persona.create({
      principal: owner,
      input: createPersonaSchema.parse({ name, description: `${name}, played in the room.`, avatarAssetId: stored.assetId }),
    });
    await room.root.services.persona.setActivePersona({ principal: owner, chatId: room.chatId, personaId: persona.id });
    return { personaId: persona.id, hash: stored.hash };
  };
  const hosts = await avatarFor(room.host, "First");
  const players = await avatarFor(player.principal, "Second");
  expect(players.hash).toBe(hosts.hash);

  await setEnabled(room, room.host.userId, false);
  expect(await served(room, viewer, hosts.hash)).toEqual(SERVES);

  await setEnabled(room, player.principal.userId, false);
  expect(await served(room, viewer, hosts.hash)).toEqual(REFUSES);
});

test("a departed member's persona and attachment art stops serving to the room, while the pin on their persona holds its face", async () => {
  await using room = await openRoom();
  const leaver = await admit(room, "floor-departed", "full");
  const viewer = await admit(room, "floor-stayer", "full");
  const seated = await personaWithAvatar(room, leaver.principal, "Played");
  const pinned = await personaWithAvatar(room, leaver.principal, "Anchor");
  await room.root.services.persona.setActivePersona({ principal: leaver.principal, chatId: room.chatId, personaId: seated.personaId });
  await room.root.services.chat.setChatAnchorPersona({ principal: room.host, chatId: room.chatId, personaId: pinned.personaId });
  const attachment = await store(room.root, leaver.principal, "attachment");
  await say(room, leaver.principal, "", [attachment.assetId]);

  const art = async (): Promise<readonly unknown[]> => [
    await served(room, viewer, seated.avatar.hash),
    await renders(room, viewer, attachment),
    await served(room, viewer, pinned.avatar.hash),
  ];
  expect(await art()).toEqual([SERVES, visible(attachment), SERVES]);

  await room.root.services.chat.selfLeave({ principal: leaver.principal, chatId: room.chatId });

  expect(await art()).toEqual([REFUSES, WITHHELD, SERVES]);

  // The pin holds for the room, not for whoever once sat in it: a member who leaves loses its face too.
  await room.root.services.chat.selfLeave({ principal: viewer.principal, chatId: room.chatId });
  expect(await served(room, viewer, pinned.avatar.hash)).toEqual(REFUSES);
});

test("a fork carries the held pin's face to a member seated only in the fork, and the origin's pin grants that member nothing", async () => {
  await using room = await openRoom();
  const leaver = await admit(room, "floor-pinned-player", "full");
  const stayer = await admit(room, "floor-origin-stayer", "full");
  const pinned = await personaWithAvatar(room, leaver.principal, "Carried");
  await room.root.services.chat.setChatAnchorPersona({ principal: room.host, chatId: room.chatId, personaId: pinned.personaId });
  await room.root.services.chat.selfLeave({ principal: leaver.principal, chatId: room.chatId });
  const fork = (await room.root.services.chat.forkChat({ principal: room.host, chatId: room.chatId })).chat.id;
  const forkOnly = await admit(room, "floor-fork-member", "full", fork);
  expect(await served(room, forkOnly, pinned.avatar.hash)).toEqual(SERVES);

  // With the fork's own pin cleared, the origin still pins the persona, but this member has no seat there.
  await room.root.services.chat.setChatAnchorPersona({ principal: room.host, chatId: fork, personaId: null });
  expect(await served(room, forkOnly, pinned.avatar.hash)).toEqual(REFUSES);
  expect(await served(room, stayer, pinned.avatar.hash)).toEqual(SERVES);
});

test("a co-member's picture the room never references reads as missing on every door, while their character, seated persona and pinned persona serve", async () => {
  await using room = await openRoom();
  const seated = await personaWithAvatar(room, room.host, "Worn");
  const pinned = await personaWithAvatar(room, room.host, "Anchored");
  await room.root.services.persona.setActivePersona({ principal: room.host, chatId: room.chatId, personaId: seated.personaId });
  await room.root.services.chat.setChatAnchorPersona({ principal: room.host, chatId: room.chatId, personaId: pinned.personaId });
  const unplaced = await store(room.root, room.host, "gallery");
  const viewer = await admit(room, "floor-peer", "full");

  expect([
    await served(room, viewer, room.characterAvatar.hash),
    await served(room, viewer, seated.avatar.hash),
    await served(room, viewer, pinned.avatar.hash),
  ]).toEqual([SERVES, SERVES, SERVES]);
  expect(await renders(room, viewer, unplaced)).toEqual(WITHHELD);
});

test("a character that leaves the roster and a persona its player puts down stop serving their art, while the persona taken up serves", async () => {
  await using room = await openRoom();
  const guestAvatar = await store(room.root, room.host, "avatar");
  const guest = await room.root.services.character.create({
    principal: room.host,
    input: createCharacterSchema.parse({ handle: "floor-guest", name: "Guest", description: "A guest who leaves.", avatarAssetId: guestAvatar.assetId }),
  });
  await room.root.services.chat.addCharacterToChat({ principal: room.host, chatId: room.chatId, characterId: guest.id });
  const putDown = await personaWithAvatar(room, room.host, "Put down");
  const takenUp = await personaWithAvatar(room, room.host, "Taken up");
  await room.root.services.persona.setActivePersona({ principal: room.host, chatId: room.chatId, personaId: putDown.personaId });
  const viewer = await admit(room, "floor-roster-watcher", "full");
  expect([await served(room, viewer, guestAvatar.hash), await served(room, viewer, putDown.avatar.hash)]).toEqual([SERVES, SERVES]);

  await room.root.services.chat.removeCharacterFromChat({ principal: room.host, chatId: room.chatId, characterId: guest.id });
  await room.root.services.persona.setActivePersona({ principal: room.host, chatId: room.chatId, personaId: takenUp.personaId });

  expect([
    await served(room, viewer, guestAvatar.hash),
    await served(room, viewer, putDown.avatar.hash),
    await served(room, viewer, takenUp.avatar.hash),
    await served(room, viewer, room.characterAvatar.hash),
  ]).toEqual([REFUSES, REFUSES, SERVES, SERVES]);
});

test("a picture placed twice in one shared room resolves once there and resolves nothing in another room both members share", async () => {
  await using room = await openRoom();
  const viewer = await admit(room, "floor-two-rooms", "full");
  const elsewhereCharacter = await room.root.services.character.create({
    principal: room.host,
    input: createCharacterSchema.parse({ handle: "floor-elsewhere", name: "Elsewhere", description: "A keeper of the second room." }),
  });
  const elsewhere = (await room.root.services.chat.startChat({ principal: room.host, characterIds: [elsewhereCharacter.id], opening: "none" })).chat.id;
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: elsewhere, input: { invitedHandle: viewer.principal.handle } });
  await seedInvitedChatParticipant(room.root, { principal: viewer.principal, inviteId: invite.invite.id });
  const picture = await store(room.root, room.host, "attachment");
  await say(room, room.host, "", [picture.assetId]);
  await say(room, room.host, "Once more.", [picture.assetId]);

  const caller = await room.root.internalCallerFor(viewer.principal.userId);
  const refsIn = async (chatId: ChatId): Promise<AssetId[]> =>
    (await caller.assets.resolveChatBlobRefs({ chatId, assetIds: [picture.assetId] })).map((ref) => ref.assetId);
  expect(await refsIn(room.chatId)).toEqual([picture.assetId]);
  expect(await refsIn(elsewhere)).toEqual([]);
});

test("a departed host's character art stops serving to the members still in the room, like a disabled host's", async () => {
  await using room = await openRoom();
  const viewer = await admit(room, "floor-remainer", "full");
  expect(await served(room, viewer, room.characterAvatar.hash)).toEqual(SERVES);

  await room.root.services.chat.selfLeave({ principal: room.host, chatId: room.chatId });

  expect(await served(room, viewer, room.characterAvatar.hash)).toEqual(REFUSES);
});
