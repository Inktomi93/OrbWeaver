import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  MESSAGE_EDIT_NAME,
  MESSAGE_MOVE_DOWN_NAME,
  MESSAGE_MOVE_GENERATING,
  MESSAGE_MOVE_UP_NAME,
  MESSAGE_REASONING_CLEAR_CONFIRM,
  MESSAGE_REASONING_CLEAR_NAME,
  MESSAGE_REASONING_CLEAR_TITLE,
  MESSAGE_REASONING_EDIT_NAME,
  MESSAGE_REASONING_NAME,
  MESSAGE_REASONING_SAVE_NAME,
} from "#client/features/chat/lib/message-action-names.ts";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

// The production transcript surface over the real composed server and the corpus's own rooms.
const STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";
const START_TURN_LABEL = "Start a turn";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "chat.editMessage",
  "chat.moveMessage",
  "chat.editReasoning",
  "chat.clearReasoning",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;
const HOST_REASONING = "Host line reasoning.";
// A short room keeps every row mounted, so both ends of the transcript are on screen.
const SHORT_ROOM = { min: 3, max: 8 } as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A short room the owner HOSTS with at least two authors; its first line carries planted reasoning. */
async function hostRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly ids: readonly MessageId[] }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const detail = await host.chat.getChat({ chatId: room.id });
    const page = await host.chat.listMessages({ chatId: room.id });
    const messages = page.messages.toSorted((a, b) => a.seq - b.seq);
    if (
      detail.viewerIsHost &&
      page.previousCursor === null &&
      messages.length >= SHORT_ROOM.min &&
      messages.length <= SHORT_ROOM.max &&
      new Set(messages.map((m) => m.authorUserId)).size > 1
    ) {
      const [first] = messages;
      if (first !== undefined) {
        await host.chat.editReasoning({ chatId: room.id, messageId: first.id, reasoning: HOST_REASONING });
      }
      return { chatId: room.id, host, ids: messages.map((m) => m.id) };
    }
  }
  throw new Error("The corpus has no short room the owner hosts with two authors");
}

/** A room the owner hosts whose newest page does not reach the start of its history, so older canon exists. */
async function pagedRoom(
  root: Harness,
): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly first: { readonly id: MessageId; readonly seq: number } }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const detail = await host.chat.getChat({ chatId: room.id });
    const page = await host.chat.listMessages({ chatId: room.id });
    const first = page.messages.toSorted((a, b) => a.seq - b.seq)[0];
    if (detail.viewerIsHost && page.previousCursor !== null && first !== undefined) {
      return { chatId: room.id, host, first: { id: first.id, seq: first.seq } };
    }
  }
  throw new Error("The corpus has no room the owner hosts with more rows than its first page");
}

/** A room the corpus's second human HOSTS and the owner joins as a member. Each writes one line and plants reasoning
 *  on it as that line's author. The second human's room has no databank of its own, so a commit there embeds
 *  nothing (retrieval reads the HOST's databank). The viewer is the owner, a plain member. */
async function memberRoom(
  root: Harness,
  memberIdentities: { readonly sharedMember: { readonly viewer: { readonly userId: UserId } } } | undefined,
): Promise<{ readonly chatId: ChatId; readonly viewer: Caller; readonly ownLine: MessageId; readonly hostLine: MessageId }> {
  const hostUserId = memberIdentities?.sharedMember.viewer.userId;
  if (hostUserId === undefined) {
    throw new Error("The corpus has no second human");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(hostUserId);
  const viewer = await root.internalCallerFor(root.ownerId);
  // The owner's memory recall would embed through an unscripted provider on commit.
  await viewer.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  const chatId = (await host.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  const hostLine = (await host.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "The host opens the scene." })).messages[0];
  await viewer.invites.redeemInvite({ token: (await host.invites.createInvite({ chatId, input: {} })).token });
  // A joined member credits their global documents to the room's retrieval, which would embed on commit; the
  // host holds them out, as the production visibility verb lets a host do.
  await host.chat.setChatDocumentVisibility({ chatId, visibility: { hidden: await viewer.databank.listGlobal() } });
  const ownLine = (await viewer.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "The member answers." })).messages[0];
  if (hostLine === undefined || ownLine === undefined) {
    throw new Error("The production commit door returned no slot");
  }
  await host.chat.editReasoning({ chatId, messageId: hostLine.id, reasoning: HOST_REASONING });
  await viewer.chat.editReasoning({ chatId, messageId: ownLine.id, reasoning: "Member line reasoning." });
  return { chatId, viewer, ownLine: ownLine.id, hostLine: hostLine.id };
}

/** Serve the browser's reads and writes from `viewer`'s own caller, so the room answers as that principal. */
async function serveAs(root: Harness, page: Page, viewer: Caller): Promise<void> {
  const auth = await root.http.request("/api/auth/config");
  const authBody = await auth.text();
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: authBody }));
  await routeTrpc(page, serveCorpusProcedures(viewer, PROCEDURES));
}

const storyProps = (chatId: ChatId): Parameters<typeof RoomTranscriptStory>[0] => ({
  chatId,
  width: 960,
  height: 900,
  appearance: appearanceSettingsSchema.parse({}),
  startTurnLabel: START_TURN_LABEL,
});

const order = async (caller: Caller, chatId: ChatId): Promise<readonly MessageId[]> =>
  (await caller.chat.listMessages({ chatId })).messages.toSorted((a, b) => a.seq - b.seq).map((message) => message.id);

/** Open the row's own editor and return the row; the host's Move arrows live in its toolbar. */
async function enterEdit(page: Page, id: MessageId): Promise<Locator> {
  const row = page.locator(`[data-message-id="${id}"]`);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true }).click();
  await expect(row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true })).toBeVisible();
  return row;
}

const upArrow = (row: Locator): Locator => row.getByRole("button", { name: MESSAGE_MOVE_UP_NAME, exact: true });
const downArrow = (row: Locator): Locator => row.getByRole("button", { name: MESSAGE_MOVE_DOWN_NAME, exact: true });

test("the host's edit toolbar moves a row down and disables the arrows at the true ends of the chat", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, ids } = await hostRoom(root);
  const [first, second, third] = ids;
  const last = ids.at(-1);
  if (first === undefined || second === undefined || third === undefined || last === undefined) {
    throw new Error("The room has no interior row");
  }
  await serveAs(root, page, host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const top = await enterEdit(page, first);
  await expect(upArrow(top)).toBeDisabled();
  await expect(downArrow(top)).toBeEnabled();
  await top.getByRole("button", { name: "Cancel edit", exact: true }).click();

  const bottom = await enterEdit(page, last);
  await expect(downArrow(bottom)).toBeDisabled();
  await expect(upArrow(bottom)).toBeEnabled();
  await bottom.getByRole("button", { name: "Cancel edit", exact: true }).click();

  const middle = await enterEdit(page, second);
  await downArrow(middle).click();
  await expect.poll(() => order(host, chatId)).toEqual([first, third, second, ...ids.slice(3)]);
});

test("the first loaded row moves up when older history exists beyond the loaded page", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, first } = await pagedRoom(root);
  const predecessor = (await host.chat.listMessages({ chatId, cursor: { kind: "before", seq: first.seq }, limit: 1 })).messages.at(-1);
  if (predecessor === undefined) {
    throw new Error("The paged room has no row before its first loaded row");
  }
  await serveAs(root, page, host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const row = page.locator(`[data-message-id="${first.id}"]`);
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await expect
    .poll(async () => {
      await scroller.evaluate((element) => {
        element.scrollTop = 0;
      });
      return await row.count();
    })
    .toBe(1);
  const editing = await enterEdit(page, first.id);
  await expect(upArrow(editing)).toBeEnabled();
  await upArrow(editing).click();
  // The two rows trade their seq values: the moved row takes the predecessor's place.
  await expect
    .poll(async () => (await host.chat.listMessages({ chatId, cursor: { kind: "after", seq: predecessor.seq - 1 }, limit: 2 })).messages.map((m) => m.id))
    .toEqual([first.id, predecessor.id]);
});

test("the arrows disable while a turn is generating in the room", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, ids } = await hostRoom(root);
  const [middle] = ids.slice(1, 2);
  if (middle === undefined) {
    throw new Error("The room has no interior row");
  }
  await serveAs(root, page, host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const row = await enterEdit(page, middle);
  await expect(upArrow(row)).toBeEnabled();
  await expect(downArrow(row)).toBeEnabled();
  await page.getByRole("button", { name: START_TURN_LABEL, exact: true }).click();
  await expect(upArrow(row)).toBeDisabled();
  await expect(downArrow(row)).toBeDisabled();
  await expect(row.getByText(MESSAGE_MOVE_GENERATING, { exact: true })).toBeVisible();
  expect(await order(host, chatId)).toEqual(ids);
});

test("a member's edit toolbar has no move arrows", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, viewer, ownLine } = await memberRoom(root, corpus.memberIdentities);
  await serveAs(root, page, viewer);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const row = await enterEdit(page, ownLine);
  // The member's own editor is open and carries its controls; only the host-only pair is absent.
  await expect(row.getByRole("button", { name: "Save edit", exact: true })).toBeVisible();
  await expect(upArrow(row)).toHaveCount(0);
  await expect(downArrow(row)).toHaveCount(0);
});

test("reasoning Edit saves, Escape cancels, and Clear confirms before it removes the stored reasoning", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, ids } = await hostRoom(root);
  const [target] = ids;
  if (target === undefined) {
    throw new Error("The room has no first row");
  }
  await serveAs(root, page, host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const row = page.locator(`[data-message-id="${target}"]`);
  const edit = row.getByRole("button", { name: MESSAGE_REASONING_EDIT_NAME, exact: true });
  const field = row.getByRole("textbox", { name: MESSAGE_REASONING_EDIT_NAME, exact: true });
  const clear = row.getByRole("button", { name: MESSAGE_REASONING_CLEAR_NAME, exact: true });
  const stored = async (): Promise<string | null | undefined> =>
    (await host.chat.listMessages({ chatId })).messages.find((message) => message.id === target)?.reasoning;

  await edit.click();
  await field.fill("Discarded draft.");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  expect(await stored()).toBe(HOST_REASONING);

  await edit.click();
  await field.fill("Rewritten by the host.");
  await row.getByRole("button", { name: MESSAGE_REASONING_SAVE_NAME, exact: true }).click();
  await expect(field).toHaveCount(0);
  expect(await stored()).toBe("Rewritten by the host.");

  const confirm = page.getByRole("alertdialog", { name: MESSAGE_REASONING_CLEAR_TITLE, exact: true });
  await clear.click();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(await stored()).toBe("Rewritten by the host.");
  await clear.click();
  await confirm.getByRole("button", { name: MESSAGE_REASONING_CLEAR_CONFIRM, exact: true }).click();
  await expect.poll(stored).toBeNull();
});

test("a member is offered the reasoning controls on their own line only", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, viewer, ownLine, hostLine } = await memberRoom(root, corpus.memberIdentities);
  await serveAs(root, page, viewer);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(chatId));

  const own = page.locator(`[data-message-id="${ownLine}"]`);
  const hosts = page.locator(`[data-message-id="${hostLine}"]`);
  await expect(own.getByRole("button", { name: MESSAGE_REASONING_EDIT_NAME, exact: true })).toBeVisible();
  await expect(own.getByRole("button", { name: MESSAGE_REASONING_CLEAR_NAME, exact: true })).toBeVisible();
  await expect(hosts.getByRole("button", { name: MESSAGE_REASONING_NAME })).toBeVisible();
  await expect(hosts.getByRole("button", { name: MESSAGE_REASONING_EDIT_NAME, exact: true })).toHaveCount(0);
  await expect(hosts.getByRole("button", { name: MESSAGE_REASONING_CLEAR_NAME, exact: true })).toHaveCount(0);
});
