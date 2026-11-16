// A card greeting holding a panel its author wrote draws in its row's card frame (D354), through the real transcript
// over a room the root started from the card: on room load, across the greeting steps, through a held mint, a reload
// and the first send, on Tide, and gated by the greeting's own character's trust.
// @subject packages/client/src/features/chat/hooks/use-drawn-message.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameServing, CardFrameTraffic } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  captureCookieAuth,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import { CHAT_NEXT_GREETING_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { GreetingRoomStory } from "./_greeting-panel-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_greeting-panel-stories/GreetingRoomStory";
const DELIVER_LABEL = "Deliver the room's edit";
const VIEWER_PASSWORD = "greeting-panel-viewer-password";
const REPLY_FRAME = '[data-slot="reply-frame"]';
const SANDBOX = '[data-slot="sandbox-frame"]';
const PLAIN_NOTICE = '[data-slot="plain-notice"]';
const CHARACTER_NAME = "Lantern Keeper";
const PANEL_COLOR = "rgb(244, 162, 97)";
// Three greetings, each a panel of another trigger: a block with a style attribute and a macro, a stylesheet, and a
// whole document whose stylesheet styles its own body.
const GREETINGS = [
  `<div class="g-one" style="color:${PANEL_COLOR}">\n<b id="g-one">{{char}} lifts the lantern.</b>\n</div>\n\nThe road is dark.`,
  `<style>#g-two{color:${PANEL_COLOR}}</style>\n<p id="g-two">The second door opens.</p>\n\nRain on the glass.`,
  `<!DOCTYPE html>\n<html>\n<head>\n<title>Third</title>\n<style>body{color:${PANEL_COLOR}}</style>\n</head>\n\n<body>\n<p id="g-three">The third bell rings.</p>\n</body>\n</html>`,
] as const;
const GREETING_IDS = ["#g-one", "#g-two", "#g-three"] as const;
const GREETING_TEXTS = [`${CHARACTER_NAME} lifts the lantern.`, "The second door opens.", "The third bell rings."] as const;
const STYLE_SOURCE = ["{", "}", "color:"] as const;
const READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "plugin.transformForDisplay",
  "character.get",
  "chat.setSeededGreeting",
] as const;

interface GreetingRoom {
  readonly root: Root;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly greetingId: MessageId;
}

async function createKeeper(root: Root, handle: string, name: string, greetings: readonly string[]): Promise<CharacterId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle, name, description: "Keeps the lantern.", greetings: greetings.map((text) => ({ text })) }),
  });
  return card.id;
}

/** A room the root started from a card whose greetings are {@link GREETINGS}, its first greeting seeded. */
async function openGreetingRoom(options?: Parameters<typeof createCorpusHarness>[1]): Promise<GreetingRoom> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness(undefined, options));
  const caller = await root.internalCallerFor(root.ownerId);
  const characterId = await createKeeper(root, "lantern-keeper", CHARACTER_NAME, GREETINGS);
  const started = await caller.chat.startChat({ characterIds: [characterId], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("The room did not seed the card's greeting");
  }
  construction.move();
  return { root, chatId: started.chat.id, characterId, greetingId: greeting.id };
}

async function serveRoom(page: Page, root: Root, corpus: Corpus, serving: CardFrameServing = {}): Promise<CardFrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic = await routeCardFrames(page, root, cookie, serving);
  return Object.assign(traffic, {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await page.unrouteAll({ behavior: "wait" });
    },
  });
}

interface Corpus {
  readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] };
}

const rowOf = (page: Page, id: MessageId): Locator => page.locator(`[data-slot="message-row"][data-message-id="${id}"]`);
const frameOf = (row: Locator): FrameLocator => row.locator(`${REPLY_FRAME} ${SANDBOX}`).contentFrame();

/** The greeting row draws greeting `index` in its routed frame, in the panel's own colour, and prints no CSS. */
async function expectFramed(row: Locator, index: number): Promise<void> {
  await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const shown = frameOf(row).locator(GREETING_IDS[index] ?? "");
  await expect(shown).toHaveText(GREETING_TEXTS[index] ?? "");
  expect(await shown.evaluate((node) => getComputedStyle(node).color)).toBe(PANEL_COLOR);
  const text = (await row.textContent()) ?? "";
  expect(STYLE_SOURCE.filter((source) => text.includes(source))).toEqual([]);
}

/** Step the greeting forward and deliver the edit the step emits. */
async function stepGreeting(page: Page, row: Locator): Promise<void> {
  const next = row.getByRole("button", { name: CHAT_NEXT_GREETING_NAME, exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(next).toBeEnabled();
  await page.getByRole("button", { name: DELIVER_LABEL, exact: true }).click();
}

test("a greeting's panel draws in its frame on room load, its macro resolved", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  await expectFramed(row, 0);
  await expect(frameOf(row).getByText("The road is dark.")).toBeVisible();
});

test("each greeting step draws the next greeting's panel in a frame of its own bytes", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  await expectFramed(row, 0);
  for (const index of [1, 2]) {
    await stepGreeting(page, row);
    await expectFramed(row, index);
    // The frame holds only the greeting it was minted for.
    await expect(frameOf(row).locator(GREETING_IDS[index - 1] ?? "")).toHaveCount(0);
  }
  // The whole document's html, head and body wrappers print nothing, and its `body` rule styles the frame's body.
  const frameBody = frameOf(row).locator("body");
  expect(await frameBody.evaluate((node) => getComputedStyle(node).color)).toBe(PANEL_COLOR);
  await expect(frameOf(row).locator("[data-frame-reply] html, [data-frame-reply] head, [data-frame-reply] body")).toHaveCount(0);
});

test("steps taken while the mint is held settle on the last greeting, never an earlier one", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using traffic = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  await expect(row.locator(REPLY_FRAME)).toHaveAttribute("data-delivery", "held");
  await stepGreeting(page, row);
  await stepGreeting(page, row);
  await expect(row.locator(REPLY_FRAME)).toHaveAttribute("data-delivery", "held");
  mints.resolve();
  await expectFramed(row, 2);
  await expect(frameOf(row).locator(`${GREETING_IDS[0]}, ${GREETING_IDS[1]}`)).toHaveCount(0);
  // Positive control: a mint was asked for each greeting the row showed.
  expect(traffic.mints).toBeGreaterThanOrEqual(1);
});

test("after a reload the stepped greeting draws framed again", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.chat.setSeededGreeting({ chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  await expectFramed(rowOf(page, room.greetingId), 1);
  await page.reload();
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  await expect(rowOf(page, room.greetingId).locator(REPLY_FRAME)).toHaveCount(1);
  await expectFramed(rowOf(page, room.greetingId), 1);
});

test("the first send freezes the greeting and it stays framed, with no step left to take", async ({ corpus, mount, page }) => {
  // The commit embeds the user's message for memory; the corpus provider answers that, and nothing else is asked.
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const room = await openGreetingRoom({ providerFetch: provider.execute });
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  await expectFramed(row, 0);
  await expect(row.getByRole("button", { name: CHAT_NEXT_GREETING_NAME, exact: true })).toBeVisible();
  const caller = await root.internalCallerFor(root.ownerId);
  // The user turn's commit half, which bakes the greeting at the first user turn exactly as a send does.
  await caller.chat.commitMessage({ chatId: room.chatId, content: "I take the lantern.", timeZone: UTC_TIME_ZONE });
  await page.getByRole("button", { name: DELIVER_LABEL, exact: true }).click();
  await expect(page.getByText("I take the lantern.")).toBeVisible();
  await expect(row.getByRole("button", { name: CHAT_NEXT_GREETING_NAME, exact: true })).toHaveCount(0);
  await expectFramed(row, 0);
});

test("with the character's HTML trust off the greeting reads plain with the notice, its CSS never printed", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  // Positive control: the greeting drew, its panel's words included, so the absence of a frame is the trust's doing.
  await expect(row.getByText("The road is dark.")).toBeVisible();
  await expect(row.getByText(GREETING_TEXTS[0])).toBeVisible();
  await expect(row.locator(REPLY_FRAME)).toHaveCount(0);
  await expect(row.locator(PLAIN_NOTICE)).toHaveCount(1);
  const text = (await row.textContent()) ?? "";
  expect(STYLE_SOURCE.filter((source) => text.includes(source))).toEqual([]);
});

test("tide: a greeting's panel is one framed bubble", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  await (await root.internalCallerFor(root.ownerId)).settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle: "tide" } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  const row = rowOf(page, room.greetingId);
  await expectFramed(row, 0);
  await expect(row.locator('[data-slot="message-bubble-train"] > [data-slot="message-bubble"]')).toHaveCount(1);
});

test("in a group room each greeting is gated by its own character's trust", async ({ corpus, mount, page }) => {
  const room = await openGreetingRoom();
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  const guardId = await createKeeper(root, "gate-guard", "Gate Guard", [GREETINGS[0]]);
  await caller.character.update({ characterId: guardId, input: { trustHtml: false, interactiveHtml: false } });
  await caller.chat.addCharacterToChat({ chatId: room.chatId, characterId: guardId });
  const { messages } = await caller.chat.listMessages({ chatId: room.chatId });
  const guardGreeting = messages.find((message) => message.characterId === guardId);
  expect(guardGreeting).toBeDefined();
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof GreetingRoomStory>(STORY, { chatId: room.chatId, messageId: room.greetingId, deliverLabel: DELIVER_LABEL });
  await expectFramed(rowOf(page, room.greetingId), 0);
  const guardRow = rowOf(page, guardGreeting?.id ?? room.greetingId);
  await expect(guardRow.getByText("The road is dark.")).toBeVisible();
  await expect(guardRow.getByText("Gate Guard lifts the lantern.")).toBeVisible();
  await expect(guardRow.locator(REPLY_FRAME)).toHaveCount(0);
  await expect(guardRow.locator(PLAIN_NOTICE)).toHaveCount(1);
});
