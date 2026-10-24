// One seat's history floor gives one verdict on every read that applies it: the message list, the co-participant
// picture render, and the chat-list search over a room's tail message, for a from-join, a full and a host seat.
// @subject packages/server/src/domain/chat/substrate/auth/clamp.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// @subject packages/server/src/domain/chat/persistence/co-participant-assets.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { JoinHistoryVisibility } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, ChatId, Handle, MessageId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, seedChatInvite, seedCorpusActors, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import { signedInMember } from "../../../entry/_auth-roots.ts";

const PNG = "image/png";
/** A word only the planted messages carry, so a search hit can come from nothing but their body. */
const PHRASE = "emberglass";

interface Room extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly chatId: ChatId;
}

async function openRoom(): Promise<Room> {
  const root = await createServerHarness({ startJobs: false, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const { owner: host } = await seedCorpusActors(root);
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "floor-warden", name: "Warden", description: "A warden of the room's ledgers." }),
  });
  const room = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  return { root, host, chatId: room.chat.id, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

async function admit(room: Room, handle: string, visibility: JoinHistoryVisibility): Promise<Principal> {
  const guest = await room.root.principalFor((await signedInMember(room.root, castId<Handle>(handle))).id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: guest.userId, visibility });
  return guest;
}

async function storePicture(room: Room): Promise<AssetId> {
  const bytes = makeAssetBytes(room.root.idSource.typeId(ID_PREFIX.asset));
  return (await room.root.services.assets.store({ principal: room.host, bytes, kind: "attachment", mime: PNG })).assetId;
}

async function say(room: Room, content: string, attached: readonly AssetId[] = []): Promise<MessageId> {
  const message = (await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content, attachmentAssetIds: attached }))
    .messages[0];
  if (message === undefined) {
    throw new Error("commitMessage returned no committed row");
  }
  return message.id;
}

/** Whether `viewer` reaches the tail message `messageId`, carrying `picture` and {@link PHRASE}, on each floored read. */
async function reaches(
  room: Room,
  viewer: Principal,
  messageId: MessageId,
  picture: AssetId,
): Promise<{ readonly listed: boolean; readonly rendered: boolean; readonly found: boolean }> {
  const page = await room.root.services.chat.listMessages({ principal: viewer, chatId: room.chatId });
  const caller = await room.root.internalCallerFor(viewer.userId);
  const refs = await caller.assets.resolveChatBlobRefs({ chatId: room.chatId, assetIds: [picture] });
  const search = await room.root.services.chat.listChats({ principal: viewer, search: PHRASE });
  return {
    listed: page.messages.some(({ id }) => id === messageId),
    rendered: refs.some((ref) => ref.assetId === picture),
    found: search.items.some((item) => item.id === room.chatId),
  };
}

const REACHED = { listed: true, rendered: true, found: true } as const;
const WITHHELD = { listed: false, rendered: false, found: false } as const;

test("the message list, the picture render and the tail search share each seat's floor", async () => {
  await using room = await openRoom();
  const before = await storePicture(room);
  const preJoin = await say(room, `The ${PHRASE} ledger, before anyone joined.`, [before]);
  const headAtJoin = await say(room, "The room moves on.");
  const joiner = await admit(room, "floor-joiner", "from-join");
  const founder = await admit(room, "floor-founder", "full");
  // The head at the join sits on the joiner's floor; removing it leaves the pre-join row as the room's tail,
  // which is the only row the search reads.
  await room.root.services.chat.deleteMessages({ principal: room.host, chatId: room.chatId, messageIds: [headAtJoin] });

  expect(await reaches(room, joiner, preJoin, before)).toEqual(WITHHELD);
  expect(await reaches(room, founder, preJoin, before)).toEqual(REACHED);
  expect(await reaches(room, room.host, preJoin, before)).toEqual(REACHED);

  const after = await storePicture(room);
  const postJoin = await say(room, `The ${PHRASE} ledger, after the join.`, [after]);

  expect(await reaches(room, joiner, postJoin, after)).toEqual(REACHED);
  expect(await reaches(room, founder, postJoin, after)).toEqual(REACHED);
});
