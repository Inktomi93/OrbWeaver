// The line under the composer in a wait-for-everyone room names who the room still waits on, to each viewer in their
// own words, and moves when that person writes or is removed: the corpus root holds the room, its reads answer each
// viewer, and the written line or the roster change reaches the page on the room's live socket. Simple send says why it
// is off with an empty composer and what it does once there is text.
// @subject packages/client/src/features/chat/components/composer-tail-line.tsx
// @subject packages/client/src/features/chat/components/composer-utility-menu.tsx

import { MESSAGE_TOOLS_LABEL } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeOrbSocket, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { finiteReplies } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import {
  COMPOSER_GENERATE_REPLY_NAME,
  COMPOSER_SIMPLE_SEND_NAME,
  SIMPLE_SEND_HELPER,
  SIMPLE_SEND_NEEDS_TEXT,
} from "#client/features/chat/lib/composer-menu-names.ts";
import { NO_REPLY_YET_LEAD, REPLY_NOW_NAME, WAITING_VIEWER_WORD, waitingForLabel } from "#client/features/chat/lib/composer-tail-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const LINE = '[data-slot="composer-tail"]';
const ROOM_READS = [...SHELL_MOUNT_PROCEDURES, ...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "persona.list", "rpg.getGame", "rpg.listTurnToolCalls"] as const;

/** A corpus root whose chat turns reach the loopback corpus endpoint. No case here starts a reply, so `take` refuses. */
async function waitRoot(take: () => string): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: take(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  return await createCorpusHarness(undefined, { providerFetch: provider.execute });
}

/** The owner's one-character room bound to the scripted endpoint, waiting for everyone when `wait` is set. */
async function ownedRoom(root: Root, owner: Caller, wait: boolean): Promise<ChatId> {
  const principal = await root.principalFor(root.ownerId);
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await owner.connection.setBinding({ task: "chat", connectionId: connection.id });
  const aria = await owner.character.create({
    input: createCharacterSchema.parse({ handle: "waiting-aria", name: "Aria", description: "A warden of the gate." }),
  });
  const chatId = (await owner.chat.startChat({ characterIds: [aria.id], opening: "none" })).chat.id;
  await owner.chat.setGroupConfig({ chatId, config: { output: "per-speaker", waitForEveryone: wait } });
  return chatId;
}

/** The room's reads under `viewer`. With `carries`, the room's socket carries the room's next event it accepts. */
async function serveRoom(
  page: Page,
  root: Root,
  room: { readonly viewer: Caller; readonly chatId: ChatId; readonly carries?: (event: ChatBusEvent) => boolean },
): Promise<Awaited<ReturnType<typeof routeOrbSocket>> | undefined> {
  const { viewer, chatId, carries } = room;
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...serveCorpusProcedures(viewer, ROOM_READS),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
  });
  if (carries === undefined) {
    return;
  }
  return await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
    frames: (signal) =>
      new Promise((resolve) => {
        const stop = root.app.liveBuses.chat.subscribeAllChatEvents(({ event, seq }) => {
          if (event.chatId === chatId && carries(event)) {
            stop();
            resolve([{ channel: "chat", chatId, seq, event }]);
          }
        });
        signal.addEventListener("abort", stop, { once: true });
      }),
  });
}

test("a waiting room names who it waits on, says 'you' to that person, and moves to the reply door when they write", async ({ corpus, mount, page }) => {
  using plan = finiteReplies<string>("waiting line", []);
  await using root = await waitRoot(plan.take);
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-human capability binds when a caller is built, so both callers follow the setting.
  const owner = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  const chatId = await ownedRoom(root, owner, true);
  const invite = await root.services.chat.createInvite({
    principal: await root.principalFor(root.ownerId),
    chatId,
    input: { invitedHandle: (await root.principalFor(memberId)).handle },
  });
  await root.services.chat.acceptInvite({ principal: await root.principalFor(memberId), inviteId: invite.invite.id });
  const held = await owner.chat.send({ chatId, content: "I open the gate.", timeZone: UTC_TIME_ZONE });
  expect(held.messages.map(({ role }) => role)).toEqual(["user"]);
  await root.settleBackground();
  const memberName = (await owner.chat.getChat({ chatId })).participants.find(({ userId }) => userId === memberId)?.displayName;
  if (memberName === undefined) {
    throw new Error("The member's seat is not on the owner's roster");
  }

  await serveRoom(page, root, { viewer: member, chatId });
  const asMember = await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  const memberLine = page.locator(LINE);
  await expect(memberLine).toHaveAttribute("data-state", "waiting");
  await expect(memberLine).toContainText(waitingForLabel([WAITING_VIEWER_WORD]));
  await expect(memberLine.getByRole("button", { name: REPLY_NOW_NAME, exact: true })).toBeVisible();
  await asMember.unmount();
  await page.unrouteAll({ behavior: "wait" });

  const socket = await serveRoom(page, root, {
    viewer: owner,
    chatId,
    carries: (event) => event.type === "messageCommitted" && event.view?.authorUserId === memberId,
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  const line = page.locator(LINE);
  await expect(line).toContainText(waitingForLabel([memberName]));
  await expect(line.getByRole("button", { name: REPLY_NOW_NAME, exact: true })).toBeVisible();

  // The member's line posts without a reply, so nobody is left to wait on and the line offers the reply instead.
  await member.chat.commitMessage({ chatId, content: "I follow you in.", timeZone: UTC_TIME_ZONE });
  await socket?.served();
  await expect(line).toHaveAttribute("data-state", "unanswered");
  await expect(line).toContainText(NO_REPLY_YET_LEAD);
  await expect(line).not.toContainText(waitingForLabel([memberName]));
  await expect(line.getByRole("button", { name: COMPOSER_GENERATE_REPLY_NAME, exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
});

test("the waiting line stops naming a member the host removes, and stands down once one person is left", async ({ corpus, mount, page }) => {
  using plan = finiteReplies<string>("kicked member", []);
  await using root = await waitRoot(plan.take);
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const owner = await root.internalCallerFor(root.ownerId);
  const chatId = await ownedRoom(root, owner, true);
  const invite = await root.services.chat.createInvite({
    principal: await root.principalFor(root.ownerId),
    chatId,
    input: { invitedHandle: (await root.principalFor(memberId)).handle },
  });
  await root.services.chat.acceptInvite({ principal: await root.principalFor(memberId), inviteId: invite.invite.id });
  await root.settleBackground();
  const memberName = (await owner.chat.getChat({ chatId })).participants.find(({ userId }) => userId === memberId)?.displayName;
  if (memberName === undefined) {
    throw new Error("The member's seat is not on the owner's roster");
  }

  const socket = await serveRoom(page, root, { viewer: owner, chatId, carries: (event) => event.type === "chatUpdated" });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  const line = page.locator(LINE);
  await expect(line).toContainText(waitingForLabel([WAITING_VIEWER_WORD, memberName]));

  // Nobody has written, so the kick starts no reply: the line moves only because the roster it reads changed.
  await owner.invites.kick({ chatId, userId: memberId });
  await socket?.served();
  await expect(line).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
});

test("Simple send states why it is off with an empty composer, and what it does once there is text", async ({ mount, page }) => {
  using plan = finiteReplies<string>("simple send reason", []);
  await using root = await waitRoot(plan.take);
  const owner = await root.internalCallerFor(root.ownerId);
  const chatId = await ownedRoom(root, owner, false);
  await serveRoom(page, root, { viewer: owner, chatId });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });

  const tools = page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true });
  const item = page.getByRole("menuitem", { name: COMPOSER_SIMPLE_SEND_NAME, exact: true });
  await tools.click();
  await expect(item).toHaveAttribute("aria-disabled", "true");
  await expect(item).toHaveAccessibleDescription(SIMPLE_SEND_NEEDS_TEXT);
  await expect(item.getByText(SIMPLE_SEND_NEEDS_TEXT, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill("Posting this one quietly.");
  await tools.click();
  await expect(item).not.toHaveAttribute("aria-disabled", "true");
  await expect(item).toHaveAccessibleDescription(SIMPLE_SEND_HELPER);
  await page.unrouteAll({ behavior: "wait" });
});
