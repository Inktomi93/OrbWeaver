// A stored picture reaches the model only when the room itself placed it, read off the real provider request on
// the composition root; fork and duplicate carry the placing link with the body that cites it.
// @subject packages/server/src/domain/chat/verbs/resolve-media-ref.ts
// @subject packages/server/src/domain/chat/verbs/fork.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { assetIdsInContent, contentSpanRaw } from "@orb/kit/content";
import type { AssetId, ChatId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/factories/chat.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { onTestFinished } from "vitest";

const PNG = "image/png";
const IMAGE_MODEL = "placement-image-v1";
const REPLY = "The keeper studies the ledger.";
/** The host's turn cue: it picks this turn's request out of every chat completion the box sends. */
const TURN_CUE = "Describe what the room has shown you.";

interface Box {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly member: Principal;
  readonly chatBodies: readonly string[];
  readonly images: Uint8Array[];
}

/** A vision-capable chat model and an image model on one scripted provider that records every chat request body. */
async function openBox(): Promise<Box> {
  const chatBodies: string[] = [];
  const images: Uint8Array[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      chatBodies.push(body);
      return REPLY;
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images,
  });
  const root = await createServerHarness({ startJobs: false, providerFetch: wire.execute });
  onTestFinished(async () => {
    await root[Symbol.asyncDispose]();
  });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const imageConnection = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: owner, task: "generateImage", connectionId: imageConnection.id });
  return { root, host: owner, member: await root.principalFor(secondUserId), chatBodies, images };
}

/** A room the host started, with `guests` admitted through the real invite. */
async function openRoom(box: Box, guests: readonly Principal[], handle = "placement-keeper"): Promise<ChatId> {
  const character = await box.root.services.character.create({
    principal: box.host,
    input: createCharacterSchema.parse({ handle, name: "Keeper", description: "A keeper reads the orbital ledger." }),
  });
  const room = await box.root.services.chat.startChat({ principal: box.host, characterIds: [character.id], opening: "none" });
  for (const guest of guests) {
    await admit(box, room.chat.id, guest);
  }
  return room.chat.id;
}

async function admit(box: Box, chatId: ChatId, guest: Principal): Promise<void> {
  const invite = await seedChatInvite(box.root.db, box.root.services.chat.createInvite, {
    principal: box.host,
    chatId,
    input: { invitedHandle: guest.handle },
  });
  await seedInvitedChatParticipant(box.root.db, box.root.services.chat.acceptInvite, { principal: guest, inviteId: invite.id });
}

async function store(box: Box, owner: Principal, kind: "attachment" | "gallery"): Promise<AssetId> {
  const bytes = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset));
  return (await box.root.services.assets.store({ principal: owner, bytes, kind, mime: PNG })).assetId;
}

function quote(assetId: AssetId): string {
  return contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId }, alt: "quoted" });
}

interface Post {
  readonly as: Principal;
  readonly content: string;
  /** Rides the send's own attachment door, which writes the link. */
  readonly attached?: readonly AssetId[];
}

/** Post without generating. */
async function say(box: Box, chatId: ChatId, post: Post): Promise<MessageId> {
  const outcome = await box.root.services.chat.commitMessage({ principal: post.as, chatId, content: post.content, attachmentAssetIds: post.attached ?? [] });
  const message = outcome.messages[0];
  if (message === undefined) {
    throw new Error("commitMessage returned no committed row");
  }
  return message.id;
}

/** A member's generated-picture post: the picture is the run-as host's, the post is the member's. */
async function generatedPost(box: Box, chatId: ChatId, as: Principal): Promise<{ readonly messageId: MessageId; readonly assetId: AssetId }> {
  box.images.push(makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset)));
  const post = await box.root.services.chat.generateImage({ principal: as, chatId, mode: "free", prompt: "The ledger at dusk.", n: 1, gallery: false });
  const [assetId] = assetIdsInContent(post.content);
  if (assetId === undefined) {
    throw new Error("the generated post cites no picture");
  }
  return { messageId: post.id, assetId };
}

/** The `image_url` urls anywhere in one provider request body. */
function imageUrls(body: string): string[] {
  const urls: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "image_url" && typeof value === "object" && value !== null && "url" in value && typeof value.url === "string") {
        urls.push(value.url);
      } else {
        visit(value);
      }
    }
  };
  visit(JSON.parse(body));
  return urls;
}

/** The host runs a turn; answers the image parts its provider request carried. */
async function turnImageUrls(box: Box, chatId: ChatId): Promise<string[]> {
  const before = box.chatBodies.length;
  const outcome = await box.root.services.chat.send({ principal: box.host, chatId, content: TURN_CUE });
  expect(outcome.aborted).toBe(false);
  const turn = box.chatBodies.slice(before).filter((body) => body.includes(TURN_CUE));
  expect(turn).toHaveLength(1);
  return imageUrls(turn[0] ?? "");
}

/** The data URI the resolver sends for a stored picture. */
async function wireUrl(box: Box, assetId: AssetId): Promise<string> {
  const bytes = await box.root.services.assets.loadAssetBytes(assetId);
  if (bytes === null) {
    throw new Error("the picture has no stored bytes");
  }
  return `data:${PNG};base64,${Buffer.from(bytes).toString("base64")}`;
}

test("a quote of another member's picture this room never placed rides as no image part, while the host's own attachment does", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const elsewhere = await openRoom(box, [box.member], "placement-elsewhere");
  const attached = await store(box, box.host, "attachment");
  const hostsPrivate = await store(box, box.host, "gallery");
  const membersPrivate = await store(box, box.member, "gallery");
  const placedElsewhere = await store(box, box.host, "attachment");
  await say(box, elsewhere, { as: box.host, content: `Mine. ${quote(hostsPrivate)}`, attached: [placedElsewhere] });
  // Adjacent user rows: a merging wire folds the quotes into the host's attachment row.
  await say(box, room, { as: box.host, content: "", attached: [attached] });
  await say(box, room, { as: box.member, content: `Look at the host's pictures. ${quote(hostsPrivate)} ${quote(placedElsewhere)}` });
  await say(box, room, { as: box.host, content: `And the member's. ${quote(membersPrivate)}` });

  expect(await turnImageUrls(box, room)).toEqual([await wireUrl(box, attached)]);
});

test("a quote stops riding once the owner deletes the message that placed the picture", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const attached = await store(box, box.host, "attachment");
  const posted = await say(box, room, { as: box.host, content: "", attached: [attached] });
  await say(box, room, { as: box.member, content: `Quoting the host. ${quote(attached)}` });
  const url = await wireUrl(box, attached);
  expect(await turnImageUrls(box, room)).toEqual([url, url]);

  await box.root.services.chat.deleteMessages({ principal: box.host, chatId: room, messageIds: [posted] });

  expect(await turnImageUrls(box, room)).toEqual([]);
});

test("the owner's own message that cites their unlinked picture sends it, and hiding that message stops it", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const picture = await store(box, box.host, "gallery");
  const line = await say(box, room, { as: box.host, content: "The ledger." });
  await box.root.services.chat.editMessage({ principal: box.host, chatId: room, messageId: line, content: `The ledger. ${quote(picture)}` });
  await say(box, room, { as: box.member, content: `Again. ${quote(picture)}` });
  const url = await wireUrl(box, picture);
  expect(await turnImageUrls(box, room)).toEqual([url, url]);

  await box.root.services.chat.setMessageHidden({ principal: box.host, chatId: room, messageId: line, hidden: true });

  expect(await turnImageUrls(box, room)).toEqual([]);
});

test("a member's generated post sends the host-owned picture through its link", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const post = await generatedPost(box, room, box.member);
  expect((await box.root.services.assets.assetCasRefById(post.assetId))?.ownerId).toBe(box.root.ownerId);

  expect(await turnImageUrls(box, room)).toEqual([await wireUrl(box, post.assetId)]);
});

test("a fork carries the link: the copied picture renders for a fork member and rides to the model", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const post = await generatedPost(box, room, box.member);
  const url = await wireUrl(box, post.assetId);
  expect(await turnImageUrls(box, room)).toEqual([url]);

  const fork = (await box.root.services.chat.forkChat({ principal: box.host, chatId: room })).chat.id;
  await admit(box, fork, box.member);

  expect((await box.root.services.assets.resolveChatAssetRefs(box.member.userId, fork, [post.assetId])).map((ref) => ref.assetId)).toEqual([post.assetId]);
  expect(await turnImageUrls(box, fork)).toEqual([url]);
});

test("a duplicate carries the link: with the original deleted, the copy still renders for a member and rides", async () => {
  const box = await openBox();
  const room = await openRoom(box, [box.member]);
  const post = await generatedPost(box, room, box.member);
  await box.root.services.chat.duplicateMessage({ principal: box.member, chatId: room, messageId: post.messageId });
  await box.root.services.chat.deleteMessages({ principal: box.member, chatId: room, messageIds: [post.messageId] });

  expect((await box.root.services.assets.resolveChatAssetRefs(box.member.userId, room, [post.assetId])).map((ref) => ref.assetId)).toEqual([post.assetId]);
  expect(await turnImageUrls(box, room)).toEqual([await wireUrl(box, post.assetId)]);
});
