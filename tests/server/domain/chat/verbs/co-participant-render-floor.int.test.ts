// A member's render grant for another member's picture honors their own history floor and presence, read through the
// real doors: the tRPC ref resolve and the signed-in blob route. A later quote never re-opens a pre-join picture.
// @subject packages/server/src/domain/chat/verbs/load-chat-asset-refs.ts
// @subject packages/server/src/domain/chat/verbs/load-co-participant-owner.ts
// @subject packages/server/src/domain/chat/persistence/co-participant-assets.ts

import { BLOB_ROUTE } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, ChatId, Handle, MessageId } from "@orb/kit/ids";
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
/** Any positive width snaps to a variant rung, so this asks the `?w=` door rather than a particular size. */
const VARIANT_WIDTH = 64;

/** A room member with the cookie a real password login minted for them. */
interface Member {
  readonly principal: Principal;
  readonly cookie: string;
}

interface Room {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly chatId: ChatId;
}

async function openRoom(): Promise<Room & AsyncDisposable> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = await createServerHarness({
    startJobs: false,
    providerFetch: wire.execute,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" },
  });
  const { owner: host } = await seedCorpusActors(root);
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "floor-keeper", name: "Keeper", description: "A keeper of the room's pictures." }),
  });
  const room = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  return { root, host, chatId: room.chat.id, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

async function admit(room: Room, handle: string, visibility: "full" | "from-join"): Promise<Member> {
  const signedIn = await signedInMember(room.root, castId<Handle>(handle));
  const guest = await room.root.principalFor(signedIn.id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: guest.userId, visibility });
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

async function blobStatus(room: Room, viewer: Member, path: string): Promise<number> {
  const response = await room.root.http.request(path, { headers: { cookie: viewer.cookie } });
  await response.arrayBuffer();
  return response.status;
}

/** What the member can render of `assetId`: the routed chat ref resolve, and the blob original and variant by hash. */
async function renders(
  room: Room,
  viewer: Member,
  assetId: AssetId,
  hash: string,
): Promise<{ readonly refs: AssetId[]; readonly original: number; readonly variant: number }> {
  const caller = await room.root.internalCallerFor(viewer.principal.userId);
  const refs = await caller.assets.resolveChatBlobRefs({ chatId: room.chatId, assetIds: [assetId] });
  return {
    refs: refs.map((ref) => ref.assetId),
    original: await blobStatus(room, viewer, `${BLOB_ROUTE}/${hash}`),
    variant: await blobStatus(room, viewer, `${BLOB_ROUTE}/${hash}?w=${VARIANT_WIDTH}`),
  };
}

const VISIBLE = { original: 200, variant: 200 } as const;
const WITHHELD = { refs: [], original: 404, variant: 404 } as const;

async function storePicture(room: Room): Promise<{ readonly picture: AssetId; readonly hash: string }> {
  const bytes = makeAssetBytes(room.root.idSource.typeId(ID_PREFIX.asset));
  const picture = (await room.root.services.assets.store({ principal: room.host, bytes, kind: "attachment", mime: PNG })).assetId;
  const hash = (await room.root.services.assets.assetCasRefById(picture))?.hash;
  if (hash === undefined) {
    throw new Error("the stored picture has no CAS ref");
  }
  return { picture, hash };
}

test("a from-join member cannot render a pre-join picture through a later quote, while a full-history member and a post-join placement can", async () => {
  await using room = await openRoom();
  const { picture, hash } = await storePicture(room);
  const placed = await say(room, room.host, "", [picture]);
  // The canon head at the join is inside a from-join floor, so the picture must sit strictly below it.
  await say(room, room.host, "The room moves on.");
  const joiner = await admit(room, "floor-joiner", "from-join");
  const founder = await admit(room, "floor-founder", "full");
  const joinerPage = await room.root.services.chat.listMessages({ principal: joiner.principal, chatId: room.chatId });
  expect(joinerPage.messages.map(({ id }) => id)).not.toContain(placed);

  await say(room, joiner.principal, `Remember this one? ${quote(picture)}`);

  expect(await renders(room, joiner, picture, hash)).toEqual(WITHHELD);
  expect(await renders(room, founder, picture, hash)).toEqual({ refs: [picture], ...VISIBLE });

  await say(room, room.host, `Here it is again. ${quote(picture)}`);

  expect(await renders(room, joiner, picture, hash)).toEqual({ refs: [picture], ...VISIBLE });
});

test("a member who leaves the room loses the render of a picture they could see while present", async () => {
  await using room = await openRoom();
  const { picture, hash } = await storePicture(room);
  await say(room, room.host, "", [picture]);
  const member = await admit(room, "floor-leaver", "full");
  expect(await renders(room, member, picture, hash)).toEqual({ refs: [picture], ...VISIBLE });

  await room.root.services.chat.selfLeave({ principal: member.principal, chatId: room.chatId });

  expect(await renders(room, member, picture, hash)).toEqual(WITHHELD);
});
