// A structured send compiles into the one stored body, so every later reader sees an ordinary attached picture:
// each case enters at the tRPC door and reads the real provider request off the composition root.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/contracts/src/chat/content-blocks.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, SendContentBlock } from "@orb/contracts/chat";
import { contentSpansToBlocks, SEND_BLOCK_LIMITS } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { tokenizeContent } from "@orb/kit/content";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedChatInvite,
  seedCorpusActors,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import { onTestFinished } from "vitest";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";

const PNG = "image/png";
const BEFORE = "Before the picture.";
const AFTER = "After the picture.";
const ALT = "the ledger";
const TURN_CUE = "What did the room show you?";

type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

interface Box {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly member: Principal;
  readonly caller: Caller;
  readonly memberCaller: Caller;
  readonly chatBodies: string[];
  readonly chatId: ChatId;
}

async function openBox(): Promise<Box> {
  const chatBodies: string[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      chatBodies.push(body);
      return "The keeper studies the ledger.";
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = await createServerHarness({ startJobs: false, providerFetch: wire.execute });
  onTestFinished(async () => {
    await root[Symbol.asyncDispose]();
  });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const character = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "blocks-keeper", name: "Keeper", description: "A keeper reads the ledger." }),
  });
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [character.id], opening: "none" });
  const invite = await seedChatInvite(root, { principal: owner, chatId: room.chat.id, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(root, { principal: member, inviteId: invite.invite.id });
  return {
    root,
    host: owner,
    member,
    caller: await root.internalCallerFor(owner.userId),
    memberCaller: await root.internalCallerFor(member.userId),
    chatBodies,
    chatId: room.chat.id,
  };
}

async function storePicture(box: Box, owner: Principal, kind: "attachment" | "gallery" = "attachment"): Promise<AssetId> {
  const bytes = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset));
  return (await box.root.services.assets.store({ principal: owner, bytes, kind, mime: PNG })).assetId;
}

function mixedBlocks(assetId: AssetId): SendContentBlock[] {
  return [
    { kind: "markdown", md: BEFORE },
    { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: ALT },
    { kind: "markdown", md: AFTER },
  ];
}

/** The data URI the production resolver sends for a stored picture. */
async function wireUrl(box: Box, assetId: AssetId): Promise<string> {
  const bytes = await box.root.services.assets.loadAssetBytes(assetId);
  if (bytes === null) {
    throw new Error("the picture has no stored bytes");
  }
  return `data:${PNG};base64,${Buffer.from(bytes).toString("base64")}`;
}

type WireContentPart = Readonly<Record<string, unknown>>;

function imageUrlOf(part: WireContentPart): string | undefined {
  const image = part["image_url"];
  return typeof image === "object" && image !== null && "url" in image && typeof image.url === "string" ? image.url : undefined;
}

/** The content parts of every user message in one provider request. */
function userParts(body: string): WireContentPart[][] {
  const parsed = JSON.parse(body) as { readonly messages: readonly { readonly role: string; readonly content: string | WireContentPart[] }[] };
  return parsed.messages
    .filter((message) => message.role === "user")
    .map((message) => (typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content));
}

/** Text and image parts in wire order, with the separators around the text trimmed. */
function partOrder(parts: readonly WireContentPart[]): string[] {
  return parts.map((part) => imageUrlOf(part) ?? (typeof part["text"] === "string" ? part["text"].trim() : ""));
}

function lastRequest(box: Box): string {
  const body = box.chatBodies.at(-1);
  if (body === undefined) {
    throw new Error("no chat request reached the provider");
  }
  return body;
}

/** One more host turn; answers the image urls its provider request re-sent. */
async function replayedImageUrls(box: Box, chatId: ChatId): Promise<string[]> {
  await box.caller.chat.send({ chatId, content: TURN_CUE, timeZone: UTC_TIME_ZONE });
  return userParts(lastRequest(box)).flatMap((parts) => parts.flatMap((part) => imageUrlOf(part) ?? []));
}

test("mixed blocks persist as one body, project to the same render order and reach a vision model as ordered parts", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);

  const outcome = await box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(assetId), timeZone: UTC_TIME_ZONE });

  const user = outcome.messages.find((message) => message.role === "user");
  expect(user?.content).toBe(`${BEFORE}\n\n![${ALT}](asset:${assetId})\n\n${AFTER}`);
  const rendered = contentSpansToBlocks(tokenizeContent(user?.content ?? "", { committed: true }));
  expect(rendered.map((block) => (block.kind === "markdown" ? block.md.trim() : block))).toEqual([
    BEFORE,
    { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: ALT },
    AFTER,
  ]);
  expect((await box.root.services.assets.resolveChatAssetRefs(box.member.userId, box.chatId, [assetId])).map((ref) => ref.assetId)).toEqual([assetId]);
  expect(userParts(lastRequest(box)).map(partOrder)).toContainEqual([expect.stringContaining(BEFORE), await wireUrl(box, assetId), AFTER]);
});

test("a blocks body rides every later turn through swipe, edit, fork, duplicate and a bundle round trip", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  const url = await wireUrl(box, assetId);
  const sent = await box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(assetId), timeZone: UTC_TIME_ZONE });
  const user = sent.messages.find((message) => message.role === "user");
  const reply = sent.messages.find((message) => message.role === "assistant");
  if (user === undefined || reply === undefined) {
    throw new Error("the structured send committed no turn");
  }

  await box.caller.chat.swipe({ chatId: box.chatId, messageId: reply.id, timeZone: UTC_TIME_ZONE });
  expect(userParts(lastRequest(box)).map(partOrder)).toContainEqual([expect.stringContaining(BEFORE), url, AFTER]);

  await box.caller.chat.editMessage({ chatId: box.chatId, messageId: user.id, content: `${user.content}\n\nEdited.`, timeZone: UTC_TIME_ZONE });
  expect(await replayedImageUrls(box, box.chatId)).toEqual([url]);

  const fork = (await box.caller.chat.forkChat({ chatId: box.chatId })).chat.id;
  expect(await replayedImageUrls(box, fork)).toEqual([url]);

  await box.caller.chat.duplicateMessage({ chatId: box.chatId, messageId: user.id });
  await box.caller.chat.deleteMessages({ chatId: box.chatId, messageIds: [user.id] });
  expect(await replayedImageUrls(box, box.chatId)).toEqual([url]);

  const file = await box.root.app.exportService.exportChatBundle({ principal: box.host, chatId: box.chatId });
  const descriptor = box.root.app.portability.find((entity) => entity.kind === "chat");
  if (file === null || descriptor === undefined) {
    throw new Error("the production graph produced no chat bundle or descriptor");
  }
  const imported = await descriptor.importFile(box.root.ownerId, file);
  const importedId = imported.memoryChatIds?.[0];
  if (importedId === undefined) {
    throw new Error("the bundle import wrote no room");
  }
  expect(await replayedImageUrls(box, importedId)).toEqual([url]);
});

test("a text-only model keeps the block text and reports the one dropped picture", async () => {
  const box = await openBox();
  const connection = await box.root.services.connection.create({
    principal: box.host,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, sampling: { temperature: undefined } },
      features: { detectServer: false },
    },
  });
  await box.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const assetId = await storePicture(box, box.host);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(box.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event)));

  await box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(assetId), timeZone: UTC_TIME_ZONE });

  expect(events.filter((event) => event.type === "warning" && event.code === "image_dropped")).toHaveLength(1);
  const body = lastRequest(box);
  expect(body).not.toContain("image_url");
  expect(body).not.toContain("data:image/");
  expect(body).toContain(BEFORE);
  expect(body).toContain(AFTER);
});

test("a member cannot place another user's asset through a block, and nothing commits", async () => {
  const box = await openBox();
  const hostsPrivate = await storePicture(box, box.host, "gallery");

  await expect(
    box.memberCaller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(hostsPrivate), timeZone: UTC_TIME_ZONE }),
  ).rejects.toMatchObject({ cause: { code: CHAT_OP_CODES.attachmentNotOwned } });

  expect((await box.caller.chat.listMessages({ chatId: box.chatId })).messages).toEqual([]);
  expect(await box.root.services.assets.resolveChatAssetRefs(box.member.userId, box.chatId, [hostsPrivate])).toEqual([]);
});

test("a foreign picture spelled inside a markdown block stays unplaced and off the wire", async () => {
  const box = await openBox();
  const hostsPrivate = await storePicture(box, box.host, "gallery");
  const own = await storePicture(box, box.member);
  const blocks: SendContentBlock[] = [{ kind: "markdown", md: `Quoting ![x](asset:${hostsPrivate})` }, ...mixedBlocks(own).slice(1, 2)];

  await box.memberCaller.chat.send({ chatId: box.chatId, content: "", blocks, timeZone: UTC_TIME_ZONE });

  // The host's absence defers the member's own turn, so the host's next turn is the first request.
  expect(await replayedImageUrls(box, box.chatId)).toEqual([await wireUrl(box, own)]);
  expect(await box.root.services.assets.resolveChatAssetRefs(box.member.userId, box.chatId, [hostsPrivate])).toEqual([]);
});

test("an owned asset that is not an image is refused as a picture block", async () => {
  const box = await openBox();
  const bytes = new TextEncoder().encode("%PDF-1.7 not a picture");
  const document = (await box.root.services.assets.store({ principal: box.host, bytes, kind: "attachment", mime: "application/pdf" })).assetId;

  await expect(box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(document), timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.attachmentNotOwned },
  });

  expect((await box.caller.chat.listMessages({ chatId: box.chatId })).messages).toEqual([]);
});

test("a reaped upload refuses the send instead of committing a dead ref", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  await box.root.services.assets.reapIfOrphan([assetId]);

  await expect(box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(assetId), timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.attachmentNotOwned },
  });

  expect((await box.caller.chat.listMessages({ chatId: box.chatId })).messages).toEqual([]);
});

test("a USER_INPUT regex reads the block text only and cannot touch a picture ref or its alt", async () => {
  const box = await openBox();
  const script = await box.root.services.regex.createScript({
    principal: box.host,
    input: createRegexScriptSchema.parse({
      name: "Strip refs",
      findRegex: "/!\\[[^\\]]*\\]\\([^)]*\\)|picture|ledger/g",
      replaceString: "x",
      placement: ["USER_INPUT"],
    }),
  });
  await box.root.services.regex.attachGlobal({ principal: box.host, scriptId: script.id });
  const assetId = await storePicture(box, box.host);

  const outcome = await box.caller.chat.send({ chatId: box.chatId, content: "", blocks: mixedBlocks(assetId), timeZone: UTC_TIME_ZONE });

  const user = outcome.messages.find((message) => message.role === "user");
  expect(user?.content).toBe(`Before the x.\n\n![${ALT}](asset:${assetId})\n\nAfter the x.`);
  expect(userParts(lastRequest(box)).map(partOrder)).toContainEqual([expect.stringContaining("Before the x."), await wireUrl(box, assetId), "After the x."]);
});

test("a volatile macro freezes in the block text around a picture", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  const blocks: SendContentBlock[] = [{ kind: "markdown", md: "{{roll:1d1}}" }, IMAGE_BLOCK(assetId), { kind: "markdown", md: "{{roll:1d1}} again" }];

  const outcome = await box.caller.chat.send({ chatId: box.chatId, content: "", blocks, timeZone: UTC_TIME_ZONE });

  expect(outcome.messages.find((message) => message.role === "user")?.content).toBe(`1\n\n![${ALT}](asset:${assetId})\n\n1 again`);
});

test("only block text picks a speaker: an @mention in an alt is a label", async () => {
  const box = await openBox();
  const roster = await Promise.all(
    ["aria", "bryn"].map((handle) =>
      box.root.services.character.create({
        principal: box.host,
        input: createCharacterSchema.parse({ handle, name: handle, description: "A keeper." }),
      }),
    ),
  );
  const room = await box.root.services.chat.startChat({ principal: box.host, characterIds: roster.map((character) => character.id), opening: "none" });
  const chatId = room.chat.id;
  await box.caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", policy: "list" } });
  const assetId = await storePicture(box, box.host);
  const speakers = async (blocks: SendContentBlock[]): Promise<(string | null)[]> =>
    (await box.caller.chat.send({ chatId, content: "", blocks, timeZone: UTC_TIME_ZONE })).messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.characterId);

  expect(await speakers([IMAGE_BLOCK(assetId, "@bryn")])).toEqual(roster.map((character) => character.id));
  expect(await speakers([{ kind: "markdown", md: "@bryn look" }, IMAGE_BLOCK(assetId)])).toEqual([roster[1]?.id]);
});

const MARKDOWN = (md: string): SendContentBlock => ({ kind: "markdown", md });

async function hostRegex(box: Box, findRegex: string, replaceString: string): Promise<void> {
  const script = await box.root.services.regex.createScript({
    principal: box.host,
    input: createRegexScriptSchema.parse({ name: "Host regex", findRegex, replaceString, placement: ["USER_INPUT"] }),
  });
  await box.root.services.regex.attachGlobal({ principal: box.host, scriptId: script.id });
}

async function userInputRule(box: Box, template: string): Promise<void> {
  const made = await box.root.services.automation.createRule({
    chatId: box.chatId,
    name: "Signature",
    trigger: { bus: "chat", type: "turnStarted" },
    actions: [{ type: "transform_draft", target: "user_input", template }],
    principal: box.host,
    timeZone: UTC_TIME_ZONE,
  });
  await box.root.services.automation.setRuleEnabled({ principal: box.host, ruleId: made.id, enabled: true });
}

async function userBodies(box: Box): Promise<string[]> {
  return (await box.caller.chat.listMessages({ chatId: box.chatId })).messages.filter((message) => message.role === "user").map((message) => message.content);
}

async function sendBlocks(box: Box, blocks: readonly SendContentBlock[]): Promise<void> {
  await box.caller.chat.send({ chatId: box.chatId, content: "", blocks: [...blocks], timeZone: UTC_TIME_ZONE });
}

test.for([
  { name: "a comment", first: "{{//", last: "}}" },
  { name: "a comment with text", first: "Before {{// hide", last: "end}} after" },
])("$name spanning a picture refuses rather than lose it on the wire", async ({ first, last }) => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);

  await expect(sendBlocks(box, [MARKDOWN(first), IMAGE_BLOCK(assetId), MARKDOWN(last)])).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.blockPictureLost },
  });

  expect(await userBodies(box)).toEqual([]);
});

test("a conditional the wire leaves literal keeps the picture between its markers", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);

  await sendBlocks(box, [MARKDOWN("{{#if 0}}"), IMAGE_BLOCK(assetId), MARKDOWN("{{/if}}")]);

  expect(
    userParts(lastRequest(box))
      .flat()
      .flatMap((part) => imageUrlOf(part) ?? []),
  ).toEqual([await wireUrl(box, assetId)]);
});

test("a regex-made card that would swallow a picture refuses before anything commits", async () => {
  const box = await openBox();
  await hostRegex(box, "/MAKEFENCE/g", ':::card title="x"');
  const assetId = await storePicture(box, box.host);

  await expect(sendBlocks(box, [MARKDOWN("MAKEFENCE"), IMAGE_BLOCK(assetId)])).rejects.toMatchObject({ cause: { code: CHAT_OP_CODES.blockPictureLost } });

  expect(await userBodies(box)).toEqual([]);
});

test.for([
  { name: "removes", findRegex: "/[\\s\\S]+/g", replaceString: "gone" },
  { name: "duplicates", findRegex: "/[\\s\\S]+/g", replaceString: "$&$&" },
])("a transform that $name a picture placeholder refuses", async ({ findRegex, replaceString }) => {
  const box = await openBox();
  await hostRegex(box, findRegex, replaceString);
  const assetId = await storePicture(box, box.host);

  await expect(sendBlocks(box, mixedBlocks(assetId))).rejects.toMatchObject({ cause: { code: CHAT_OP_CODES.blockPictureLost } });

  expect(await userBodies(box)).toEqual([]);
});

test("a duplicate asset cannot mask a swallowed picture", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);

  await expect(sendBlocks(box, [IMAGE_BLOCK(assetId), MARKDOWN(':::card title="x"'), IMAGE_BLOCK(assetId), MARKDOWN("tail")])).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });

  expect(await userBodies(box)).toEqual([]);
});

test("a host mask holds a phrase split across blocks exactly as in plain text", async () => {
  const box = await openBox();
  await hostRegex(box, "/bad\\s+word/g", "****");
  await box.caller.chat.send({ chatId: box.chatId, content: "bad\n\nword", timeZone: UTC_TIME_ZONE });
  await sendBlocks(box, [MARKDOWN("bad"), MARKDOWN("word")]);

  expect(await userBodies(box)).toEqual(["****", "****"]);
});

test("a user_input transform runs once per send and reads the whole message", async () => {
  const box = await openBox();
  await userInputRule(box, "{{draft}} [sig]");
  await box.caller.chat.send({ chatId: box.chatId, content: "one\n\ntwo\n\nthree", timeZone: UTC_TIME_ZONE });
  await sendBlocks(box, [MARKDOWN("one"), MARKDOWN("two"), MARKDOWN("three")]);

  const [plain, blocks] = await userBodies(box);
  expect(blocks).toBe(plain);
});

test("a picture-only send still runs the transforms and keeps their output", async () => {
  const box = await openBox();
  await userInputRule(box, "{{draft}} [sig]");
  const assetId = await storePicture(box, box.host);

  await sendBlocks(box, [IMAGE_BLOCK(assetId)]);

  expect(await userBodies(box)).toEqual([`![${ALT}](asset:${assetId}) [sig]`]);
});

test("one send's freezes draw independently across blocks and the authored body keeps its refs", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  const rolls = Array.from({ length: 8 }, () => MARKDOWN("{{roll:1d1000}}"));

  await sendBlocks(box, [...rolls.slice(0, 4), IMAGE_BLOCK(assetId), ...rolls.slice(4)]);

  const plain = Array.from({ length: rolls.length }, () => "{{roll:1d1000}}").join("\n\n");
  await box.caller.chat.send({ chatId: box.chatId, content: plain, timeZone: UTC_TIME_ZONE });
  const [blocksBody = "", plainBody = ""] = await userBodies(box);
  const distinct = (body: string): number => new Set(body.split("\n\n").filter((part) => !part.includes("asset:"))).size;
  expect(distinct(blocksBody)).toBe(distinct(plainBody));
  const [message] = (await box.caller.chat.listMessages({ chatId: box.chatId })).messages;
  const wire = await box.caller.chat.getVariantWire({ chatId: box.chatId, variantId: message?.selectedVariantId ?? ("" as never) });
  expect(wire.rawContent).toContain(`![${ALT}](asset:${assetId})`);
  expect(wire.rawContent).toContain("{{roll:1d1000}}");
  expect(wire.macroFreezes).toHaveLength(rolls.length);
});

test("a repeated picture places once per occurrence with one link", async () => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  const url = await wireUrl(box, assetId);

  await sendBlocks(box, [IMAGE_BLOCK(assetId), MARKDOWN("between"), IMAGE_BLOCK(assetId)]);

  expect(
    userParts(lastRequest(box))
      .flat()
      .filter((part) => imageUrlOf(part) === url),
  ).toHaveLength(2);
  expect((await box.root.services.assets.resolveChatAssetRefs(box.host.userId, box.chatId, [assetId])).map((ref) => ref.assetId)).toEqual([assetId]);
});

const IMAGE_BLOCK = (assetId: AssetId, alt = ALT): SendContentBlock => ({ kind: "media", media: "image", src: { kind: "asset", assetId }, alt });

const REFUSED_INPUTS: readonly { readonly name: string; readonly input: (assetId: AssetId) => Record<string, unknown> }[] = [
  { name: "an unknown block kind", input: () => ({ blocks: [{ kind: "sticker", id: "x" }] }) },
  { name: "a client-stamped html card", input: () => ({ blocks: [{ kind: "html-card", html: "<b>x</b>", trust: "tierA" }] }) },
  { name: "a choices block", input: () => ({ blocks: [{ kind: "choices", options: ["a"] }] }) },
  {
    name: "an external image",
    input: () => ({ blocks: [{ kind: "media", media: "image", src: { kind: "external", url: "https://x.test/a.png" }, alt: "" }] }),
  },
  { name: "a video claim", input: (assetId) => ({ blocks: [{ ...IMAGE_BLOCK(assetId), media: "video" }] }) },
  { name: "dims the body cannot store", input: (assetId) => ({ blocks: [{ ...IMAGE_BLOCK(assetId), dims: { w: 1, h: 1 } }] }) },
  { name: "an undeclared key", input: () => ({ blocks: [{ kind: "markdown", md: "x", extra: true }] }) },
  { name: "an empty block list", input: () => ({ blocks: [] }) },
  { name: "an empty markdown block", input: () => ({ blocks: [{ kind: "markdown", md: "" }] }) },
  { name: "text in both content and blocks", input: () => ({ content: "both", blocks: [{ kind: "markdown", md: "x" }] }) },
  { name: "an alt that closes the ref early", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, "a](asset:other)")] }) },
  { name: "an alt spanning lines", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, "a\n:::card")] }) },
  { name: "an alt the tag scanner reads as a tag", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, '<x a="b"/>')] }) },
  { name: "an alt carrying a hidden tag", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, '<lie truth="t"/>')] }) },
  { name: "an alt a later macro pass would rewrite", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, "{{char}}")] }) },
  {
    name: "an unterminated card that swallows a later picture",
    input: (assetId) => ({ blocks: [{ kind: "markdown", md: ':::card title="x"' }, IMAGE_BLOCK(assetId)] }),
  },
  {
    name: "a macro hidden after a line separator in an alt",
    input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, `${String.fromCodePoint(0x20_28)}{{char}}`)] }),
  },
  {
    name: "a paragraph separator before a macro in an alt",
    input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, `${String.fromCodePoint(0x20_29)}{{char}}`)] }),
  },
  { name: "authored text spelling a picture placeholder", input: () => ({ blocks: [{ kind: "markdown", md: String.fromCodePoint(0xe0_00) }] }) },
  { name: "an oversized alt", input: (assetId) => ({ blocks: [IMAGE_BLOCK(assetId, "a".repeat(SEND_BLOCK_LIMITS.altChars + 1))] }) },
  { name: "an oversized markdown block", input: () => ({ blocks: [{ kind: "markdown", md: "a".repeat(SEND_BLOCK_LIMITS.mdChars + 1) }] }) },
  { name: "too many blocks", input: () => ({ blocks: Array.from({ length: SEND_BLOCK_LIMITS.blocks + 1 }, () => ({ kind: "markdown", md: "x" })) }) },
  {
    name: "pictures past the attachment limit across blocks and attachments",
    input: (assetId) => ({
      blocks: [IMAGE_BLOCK(assetId)],
      attachmentAssetIds: Array.from({ length: SEND_BLOCK_LIMITS.blocks }, () => assetId),
    }),
  },
];

test.each(REFUSED_INPUTS)("the strict input refuses $name before anything commits", async ({ input }) => {
  const box = await openBox();
  const assetId = await storePicture(box, box.host);
  const request = { chatId: box.chatId, content: "", timeZone: UTC_TIME_ZONE, ...input(assetId) };

  const refusal = await box.caller.chat.send(request as Parameters<Caller["chat"]["send"]>[0]).catch((error: unknown) => error);

  expect(refusal).toMatchObject({ code: "BAD_REQUEST" });
  expect((await box.caller.chat.listMessages({ chatId: box.chatId })).messages).toEqual([]);
});
