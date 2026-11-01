import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_DUPLICATE_GENERATING, MESSAGE_DUPLICATE_NAME } from "#client/features/chat/lib/message-action-names.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

// Both surfaces run over the real composed server and the corpus's own rooms.
const TRANSCRIPT_STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";
const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const SHORT_ROOM = { min: 3, max: 8 } as const;
const FORK_TITLE = "A branch worth keeping";

const TRANSCRIPT_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "chat.duplicateMessage",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A short room the owner hosts, so every row is mounted and the owner may duplicate any of them. */
async function hostRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly ids: readonly MessageId[] }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const detail = await host.chat.getChat({ chatId: room.id });
    const page = await host.chat.listMessages({ chatId: room.id });
    const messages = page.messages.toSorted((a, b) => a.seq - b.seq);
    if (detail.viewerIsHost && page.previousCursor === null && messages.length >= SHORT_ROOM.min && messages.length <= SHORT_ROOM.max) {
      return { chatId: room.id, host, ids: messages.map((m) => m.id) };
    }
  }
  throw new Error("The corpus has no short room the owner hosts");
}

async function serveAs(root: Harness, page: Page, viewer: Caller, procedures: readonly string[]): Promise<void> {
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(viewer, procedures as never));
}

test("the message menu's Duplicate copies the row to a new slot at the end of the chat", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, ids } = await hostRoom(root);
  const source = (await host.chat.listMessages({ chatId })).messages.find((message) => message.role !== "system" && message.id === ids[1]);
  if (source === undefined) {
    throw new Error("The room has no editable interior row");
  }
  await serveAs(root, page, host, TRANSCRIPT_PROCEDURES);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(TRANSCRIPT_STORY, {
    chatId,
    width: 960,
    height: 900,
    appearance: appearanceSettingsSchema.parse({}),
    startTurnLabel: "Start a turn",
  });

  const row = page.locator(`[data-message-id="${source.id}"]`);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
  await page.getByRole("menuitem", { name: MESSAGE_DUPLICATE_NAME, exact: true }).click();

  await expect
    .poll(async () => {
      const rows = (await host.chat.listMessages({ chatId })).messages.toSorted((a, b) => a.seq - b.seq);
      return rows.length === ids.length + 1 ? rows.at(-1)?.content : null;
    })
    .toBe(source.content);
});

test("the message menu's Duplicate is disabled with its reason while a turn is generating, and a click copies nothing", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, host, ids } = await hostRoom(root);
  const target = ids[1];
  if (target === undefined) {
    throw new Error("The room has no interior row");
  }
  await serveAs(root, page, host, TRANSCRIPT_PROCEDURES);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(TRANSCRIPT_STORY, {
    chatId,
    width: 960,
    height: 900,
    appearance: appearanceSettingsSchema.parse({}),
    startTurnLabel: "Start a turn",
  });
  const rows = page.locator("[data-message-id]");
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: "Start a turn", exact: true }).click();

  const row = page.locator(`[data-message-id="${target}"]`);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
  const item = page.getByRole("menuitem", { name: MESSAGE_DUPLICATE_NAME });
  await expect(item).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(MESSAGE_DUPLICATE_GENERATING, { exact: true })).toBeVisible();
  const shown = await rows.count();
  // Playwright's click waits for an enabled target and aria-disabled never is, so the press is a real pointer click at the item.
  const box = await item.boundingBox();
  if (box === null) {
    throw new Error("The Duplicate item has no box to press");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(rows).toHaveCount(shown);
  expect((await host.chat.listMessages({ chatId })).messages).toHaveLength(ids.length);
});

test("the This-chat tab lists the forks of the room under Forks", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const fork = await host.chat.forkChat({ chatId, title: FORK_TITLE });
  expect((await host.chat.listForks({ chatId })).map((summary) => summary.id)).toEqual([fork.chat.id]);
  await serveAs(root, page, host, TAB_PROCEDURES);
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: /^Forks/ }).click();
  await expect(page.getByText(FORK_TITLE, { exact: true })).toBeVisible();
});

test("opening a fork from the details sheet enters the fork and closes the sheet", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const fork = await host.chat.forkChat({ chatId, title: FORK_TITLE });
  await serveAs(root, page, host, TAB_PROCEDURES);
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  const probe = page.locator('[data-probe="shell"]');
  await expect(probe).toHaveText(`active=${chatId} sheet=context`);

  await page.getByRole("button", { name: /^Forks/ }).click();
  await page.getByText(FORK_TITLE, { exact: true }).click();

  await expect(probe).toHaveText(`active=${fork.chat.id} sheet=none`);
});
