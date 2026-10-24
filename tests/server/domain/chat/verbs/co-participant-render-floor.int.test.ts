// A member's render grant for another member's picture honors their own history floor: a from-join member
// cannot render a picture placed before the join, even when a later message quotes it.
// @subject packages/server/src/domain/chat/verbs/load-chat-asset-refs.ts
// @subject packages/server/src/domain/chat/verbs/load-co-participant-owner.ts
// @subject packages/server/src/domain/chat/persistence/co-participant-assets.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, ChatId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
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

const PNG = "image/png";

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
  const root = await createServerHarness({ startJobs: false, providerFetch: wire.execute });
  const { owner: host } = await seedCorpusActors(root);
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "floor-keeper", name: "Keeper", description: "A keeper of the room's pictures." }),
  });
  const room = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  return { root, host, chatId: room.chat.id, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

async function admit(room: Room, visibility: "full" | "from-join"): Promise<Principal> {
  const guest = await room.root.principalFor((await room.root.actor()).id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.id });
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: guest.userId, visibility });
  return guest;
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

/** What the member can render of `assetId`: the chat-scoped ref resolve and the blob-serve gate by hash. */
async function renders(room: Room, viewer: Principal, assetId: AssetId, hash: string): Promise<{ readonly refs: AssetId[]; readonly blob: boolean }> {
  const refs = await room.root.services.assets.resolveChatAssetRefs(viewer.userId, room.chatId, [assetId]);
  const blob = await room.root.services.assets.getMetadata({ principal: viewer, hash });
  return { refs: refs.map((ref) => ref.assetId), blob: blob !== undefined };
}

test("a from-join member cannot render a pre-join picture through a later quote, while a full-history member and a post-join placement can", async () => {
  await using room = await openRoom();
  const bytes = makeAssetBytes(room.root.idSource.typeId(ID_PREFIX.asset));
  const picture = (await room.root.services.assets.store({ principal: room.host, bytes, kind: "attachment", mime: PNG })).assetId;
  const hash = (await room.root.services.assets.assetCasRefById(picture))?.hash;
  if (hash === undefined) {
    throw new Error("the stored picture has no CAS ref");
  }
  const placed = await say(room, room.host, "", [picture]);
  // The canon head at the join is inside a from-join floor, so the picture must sit strictly below it.
  await say(room, room.host, "The room moves on.");
  const joiner = await admit(room, "from-join");
  const founder = await admit(room, "full");
  const joinerPage = await room.root.services.chat.listMessages({ principal: joiner, chatId: room.chatId });
  expect(joinerPage.messages.map(({ id }) => id)).not.toContain(placed);

  await say(room, joiner, `Remember this one? ${quote(picture)}`);

  expect(await renders(room, joiner, picture, hash)).toEqual({ refs: [], blob: false });
  expect(await renders(room, founder, picture, hash)).toEqual({ refs: [picture], blob: true });

  await say(room, room.host, `Here it is again. ${quote(picture)}`);

  expect(await renders(room, joiner, picture, hash)).toEqual({ refs: [picture], blob: true });
});
