// The room's stylesheet cascade (D354, `room-sheets.ts`): a later row that uses a class only an earlier character row's
// `<style>` names draws framed in that sheet, through the real transcript over corpus rooms the root built through
// production verbs. It covers a group room's greeting window, a greeting step that swaps the sheet, the step a source
// draws at, a member's own sheet, which never carries, a room load whose tail no longer holds the greeting, and a carried
// sheet's external media, which loads only while its author allows it too.
// @subject packages/client/src/features/chat/lib/room-sheets.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { renderPolicyOverrideForStep } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameTraffic } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  captureCookieAuth,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import type { GreetingRoomStory } from "./_greeting-panel-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/chat/components/_greeting-panel-stories/GreetingRoomStory";
const STREAM_STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const GHOST_ROW = '[data-slot="ghost-message-row"]';
const FORMING_CHIP = '[data-slot="forming-card-chip"]';
const DELIVER_LABEL = "Deliver the room's edit";
const VIEWER_PASSWORD = "room-sheet-carry-viewer-password";
const REPLY_FRAME = '[data-slot="reply-frame"]';
const SANDBOX = '[data-slot="sandbox-frame"]';
const FIRST_COLOUR = "rgb(244, 162, 97)";
const SECOND_COLOUR = "rgb(42, 157, 143)";
const MEMBER_COLOUR = "rgb(231, 111, 81)";
// The keeper's two greetings: each defines the guard's class in its own colour, and draws a panel of its own.
const KEEPER_GREETINGS = [
  `<style>.rc-mark{color:${FIRST_COLOUR}}</style>\n<p class="rc-mark" id="rc-keeper">The keeper lifts the lantern.</p>`,
  `<style>.rc-mark{color:${SECOND_COLOUR}}</style>\n<p class="rc-mark" id="rc-keeper">The keeper lowers the lantern.</p>`,
] as const;
const GUARD_TEXT = "The guard nods once.";
// A row with no stylesheet, style attribute or script of its own: only the room's sheet can style it.
const GUARD_GREETING = `<p class="rc-mark" id="rc-guard">${GUARD_TEXT}</p>\n\nThe gate stays shut.`;
const REPLY_TEXT = "The lantern burns low.";
const MEMBER_TEXT = "The member's word.";
const REPLY = `<p class="rc-mark" id="rc-reply">${REPLY_TEXT}</p>\n\n<p class="rc-member" id="rc-member">${MEMBER_TEXT}</p>`;
const STREAMED_PROSE = "The wind turns.";
// A reply mid-stream: its class block is closed, so only the room trigger holds it, and its prose is still arriving.
const STREAMED = `<p class="rc-mark">${REPLY_TEXT}</p>\n\n${STREAMED_PROSE}`;
const MEMBER_MESSAGE = `<style>.rc-member{color:${MEMBER_COLOUR}}</style>\nI hold the door.`;
// As many rows as the transcript's first read holds, so the greeting and the rows after it are out of the tail on load.
const ROWS_PAST_THE_TAIL = 50;
const READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listDisplayScripts",
  "plugin.listDisplayTransforms",
  "plugin.transformForDisplay",
  "character.get",
  "chat.setSeededGreeting",
] as const;

interface CarryRoom {
  readonly chatId: ChatId;
  readonly keeperId: CharacterId;
  readonly keeperGreeting: MessageId;
}

/** A corpus root whose chat turns answer {@link REPLY}. */
async function replyingRoot(): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: REPLY, toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  return await createCorpusHarness(undefined, { providerFetch: provider.execute });
}

async function createCharacter(owner: Caller, handle: string, name: string, greetings: readonly string[]): Promise<CharacterId> {
  const card = await owner.character.create({
    input: createCharacterSchema.parse({ handle, name, description: "Keeps the gate.", greetings: greetings.map((text) => ({ text })) }),
  });
  return card.id;
}

/** A room the owner started from the keeper, its first greeting seeded at seq 1. */
async function keeperRoom(owner: Caller): Promise<CarryRoom> {
  const keeperId = await createCharacter(owner, "rc-keeper", "Lantern Keeper", KEEPER_GREETINGS);
  const started = await owner.chat.startChat({ characterIds: [keeperId], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("The room did not seed the keeper's greeting");
  }
  return { chatId: started.chat.id, keeperId, keeperGreeting: greeting.id };
}

/** The keeper's room with the guard seated in its greeting window, and the guard's greeting row. */
async function guardRoom(owner: Caller): Promise<CarryRoom & { readonly guardGreeting: MessageId }> {
  const room = await keeperRoom(owner);
  const guardId = await createCharacter(owner, "rc-guard", "Gate Guard", [GUARD_GREETING]);
  await owner.chat.addCharacterToChat({ chatId: room.chatId, characterId: guardId });
  const { messages } = await owner.chat.listMessages({ chatId: room.chatId });
  const guardGreeting = messages.find((message) => message.characterId === guardId);
  if (guardGreeting === undefined) {
    throw new Error("Seating the guard seeded no greeting");
  }
  return { ...room, guardGreeting: guardGreeting.id };
}

/** Bind the owner's chat task to the corpus endpoint, so a send commits {@link REPLY} through the real round engine. */
async function bindChat(root: Root, owner: Caller): Promise<void> {
  const connection = await root.services.connection.create({
    principal: await root.principalFor(root.ownerId),
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await owner.connection.setBinding({ task: "chat", connectionId: connection.id });
}

/** Send `content` and return the committed reply's id. */
async function sendTurn(root: Root, chatId: ChatId, content: string): Promise<MessageId> {
  const outcome = await root.services.chat.send({ principal: await root.principalFor(root.ownerId), chatId, content, timeZone: UTC_TIME_ZONE });
  const reply = outcome.messages.find((message) => message.role === "assistant");
  if (reply === undefined) {
    throw new Error("The turn committed no reply");
  }
  return reply.id;
}

async function serveRoom(page: Page, root: Root, owner: Caller): Promise<CardFrameTraffic> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(owner, READS));
  return await routeCardFrames(page, root, cookie);
}

const rowOf = (page: Page, id: MessageId): Locator => page.locator(`[data-slot="message-row"][data-message-id="${id}"]`);
const frameOf = (row: Locator): FrameLocator => row.locator(`${REPLY_FRAME} ${SANDBOX}`).contentFrame();

/** `selector` draws inside the row's routed reply frame in `colour`, and the row prints no CSS. */
async function expectCarried(row: Locator, selector: string, colour: string): Promise<void> {
  await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const shown = frameOf(row).locator(selector);
  await expect(shown).toBeVisible();
  await expect.poll(async () => await shown.evaluate((node) => getComputedStyle(node).color)).toBe(colour);
  expect((await row.textContent()) ?? "").not.toContain("color:");
}

test("a greeting's stylesheet styles a later row that uses its class with no sheet of its own, on room load", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await guardRoom(owner);
  await serveRoom(page, root, owner);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.keeperGreeting, deliverLabel: DELIVER_LABEL });
  await expectCarried(rowOf(page, room.keeperGreeting), "#rc-keeper", FIRST_COLOUR);
  await expectCarried(rowOf(page, room.guardGreeting), "#rc-guard", FIRST_COLOUR);
  await expect(frameOf(rowOf(page, room.guardGreeting)).getByText("The gate stays shut.")).toBeVisible();
});

test("a greeting step swaps the stylesheet the later row carries", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await guardRoom(owner);
  await serveRoom(page, root, owner);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.keeperGreeting, deliverLabel: DELIVER_LABEL });
  const guard = rowOf(page, room.guardGreeting);
  await expectCarried(guard, "#rc-guard", FIRST_COLOUR);
  // The step verb the greeting strip calls; in a group room the strip rides only the room's last greeting.
  await owner.chat.setSeededGreeting({ chatId: room.chatId, messageId: room.keeperGreeting, greetingIndex: 1 });
  await page.getByRole("button", { name: DELIVER_LABEL, exact: true }).click();
  await expect(frameOf(rowOf(page, room.keeperGreeting)).getByText("The keeper lowers the lantern.")).toBeVisible();
  await expectCarried(guard, "#rc-guard", SECOND_COLOUR);
});

test("a greeting at the plain step carries nothing, so the later row reads unframed", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await guardRoom(owner);
  await owner.character.update({ characterId: room.keeperId, input: renderPolicyOverrideForStep("untrusted") });
  await serveRoom(page, root, owner);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.keeperGreeting, deliverLabel: DELIVER_LABEL });
  const guard = rowOf(page, room.guardGreeting);
  // The keeper's row drew first, so the guard's row below it is settled when its frame is counted.
  await expect(rowOf(page, room.keeperGreeting).getByText("The keeper lifts the lantern.")).toBeVisible();
  await expect(guard.locator(REPLY_FRAME)).toHaveCount(0);
  // Positive control: the guard's words drew, so the missing frame is the source's step, not an empty row.
  await expect(guard.getByText(GUARD_TEXT)).toBeVisible();
});

test("a reply carries the greeting's sheet and never a member's own sheet", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  await bindChat(root, owner);
  const room = await keeperRoom(owner);
  const reply = await sendTurn(root, room.chatId, MEMBER_MESSAGE);
  await serveRoom(page, root, owner);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.keeperGreeting, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, reply);
  await expectCarried(row, "#rc-reply", FIRST_COLOUR);
  // The member's class is drawn in the same frame, so its colour is the frame's own, never the member's sheet.
  const member = frameOf(row).locator("#rc-member");
  await expect(member).toHaveText(MEMBER_TEXT);
  expect(await member.evaluate((node) => getComputedStyle(node).color)).not.toBe(MEMBER_COLOUR);
});

test("on a load whose first read no longer holds the greeting, a reply still carries its sheet", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  await bindChat(root, owner);
  const room = await keeperRoom(owner);
  for (let turn = 0; turn < ROWS_PAST_THE_TAIL; turn += 1) {
    await owner.chat.commitMessage({ chatId: room.chatId, content: `Turn ${String(turn)}.`, timeZone: UTC_TIME_ZONE });
  }
  const reply = await sendTurn(root, room.chatId, "Speak.");
  // Positive control: the transcript's own first read does not hold the greeting, so only the head read can carry it.
  const { messages } = await owner.chat.listMessages({ chatId: room.chatId });
  expect(nonEmpty(messages).some((message) => message.id === room.keeperGreeting)).toBe(false);
  await serveRoom(page, root, owner);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: reply, deliverLabel: DELIVER_LABEL });
  await expectCarried(rowOf(page, reply), "#rc-reply", FIRST_COLOUR);
});

test("a streaming reply that uses a room class holds that markup as forming, as it settles framed", async ({ mount, page }) => {
  await using root = await replyingRoot();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await keeperRoom(owner);
  // A live display script holds every streamed block on its own (D354), so the room's scripts are switched off and only
  // the room trigger can hold this one.
  for (const { script } of await owner.regex.listDisplayScripts({ chatId: room.chatId })) {
    await owner.regex.updateScript({ scriptId: script.id, input: { enabled: false } });
  }
  await serveRoom(page, root, owner);
  await mount<typeof StreamingReplyStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.keeperId,
    streamedText: STREAMED,
    streamLabel: STREAM_LABEL,
  });
  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  const ghost = page.locator(GHOST_ROW);
  // Positive control: the stream's prose drew, so the held block is the hold's doing, not an empty stream.
  await expect(ghost).toContainText(STREAMED_PROSE);
  await expect(ghost.locator(FORMING_CHIP)).toHaveCount(1);
  await expect(ghost).not.toContainText(REPLY_TEXT);
});

// The keeper's greeting sheet paints its class over an image from the internet; the guard's greeting uses that class.
const MEDIA_URL = "https://media.test/lantern.png";
const MEDIA_GREETING = `<style>.rc-mark{color:${FIRST_COLOUR};background-image:url(${MEDIA_URL})}</style>\n<p class="rc-mark" id="rc-keeper">The keeper lifts the lantern.</p>`;
const MEDIA_NOTICE = '[data-slot="plain-notice"][data-reason="character-media"]';

for (const keeperForbids of [true, false]) {
  test(`a carried sheet's external media loads only while its author allows it: keeper ${keeperForbids ? "forbids" : "allows"}`, async ({ mount, page }) => {
    await using root = await replyingRoot();
    await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { forbidExternalMedia: false } });
    // Internal callers capture one request's capability, so this one is taken after the switch.
    const owner = await root.internalCallerFor(root.ownerId);
    const keeperId = await createCharacter(owner, "rc-keeper", "Lantern Keeper", [MEDIA_GREETING]);
    await owner.character.update({ characterId: keeperId, input: { forbidExternalMedia: keeperForbids } });
    const started = await owner.chat.startChat({ characterIds: [keeperId], opening: "first-message" });
    const keeperGreeting = started.opening?.messages[0]?.id;
    const guardId = await createCharacter(owner, "rc-guard", "Gate Guard", [GUARD_GREETING]);
    await owner.chat.addCharacterToChat({ chatId: started.chat.id, characterId: guardId });
    const guardGreeting = (await owner.chat.listMessages({ chatId: started.chat.id })).messages.find((message) => message.characterId === guardId)?.id;
    if (keeperGreeting === undefined || guardGreeting === undefined) {
      throw new Error("The room did not seed both greetings");
    }
    const traffic = await serveRoom(page, root, owner);
    await page.context().route(`${new URL(MEDIA_URL).origin}/**`, async (route) => {
      await route.fulfill({ status: 404, body: "" });
    });
    await mount<typeof GreetingRoomStory>(STORY, { chatId: started.chat.id, messageId: keeperGreeting, deliverLabel: DELIVER_LABEL });
    const guard = rowOf(page, guardGreeting);
    // Positive control: the guard's row draws in the keeper's sheet, so the sheet and its media rule reached its frame.
    await expectCarried(guard, "#rc-guard", FIRST_COLOUR);
    await expect.poll(() => traffic.minted.length).toBe(2);
    // The guard allows external media, so only the carried author can withhold it from the guard's frame.
    expect(traffic.minted.map((record) => record.granted?.externalMedia)).toEqual([!keeperForbids, !keeperForbids]);
    // The guard's notice names the keeper, whose setting holds the media out.
    await expect(guard.locator(MEDIA_NOTICE).filter({ hasText: "Lantern Keeper" })).toHaveCount(keeperForbids ? 1 : 0);
  });
}
