// Earlier messages has one home, the transcript's scroll content, in every regime and chat style. Pressing it keeps the
// reader's row exactly where it was, on rows far shorter than their estimate: the case that loses a late-mounted row's delta.

import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expectPinnedFailure, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, settledBox, settledReadingRow } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_DISMISS_NAME, CHAT_HISTORY_FAILURE_COPY } from "#client/features/chat/lib/chat-surface-names.ts";
import { CHAT_HISTORY_BEGINNING, CHAT_HISTORY_PAGER_HINT, chatHistoryLoadedLabel } from "#client/features/chat/lib/transcript-copy.ts";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { PHONE, SHELL_STORIES, wallpaper } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const WITNESS_ROWS = 115;
const WALK_STEPS = 6;
const SHRINK_PX = 120;
// The list reads as at its end within this distance.
const TAIL_PX = 80;
const FOCUS_SCROLL_MARK = "data-focus-scrolled";
const WALK_TIMEOUT_MS = 60_000;
// Repeats per row, cycled so the page opens on a row taller than the screen and a short row follows it: real replies vary this much, and a uniform room never lets a measurement move the list mid-walk.
const VARIED_ROW_REPEATS = [3, 40, 180, 260, 8, 90, 20] as const;
const VARIED_CYCLE = VARIED_ROW_REPEATS.length;
const VARIED_ROWS = 60;
const DESKTOP = { width: 1280, height: 900 } as const;
const LANDSCAPE_PHONE = { width: 844, height: 390 } as const;

interface Cell {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly chatStyle: ThemeChatStyle;
  readonly coarse: boolean;
}

const CELLS: readonly Cell[] = [
  ...THEME_CHAT_STYLES.map((chatStyle) => ({ viewport: PHONE, chatStyle, coarse: true })),
  { viewport: DESKTOP, chatStyle: "document", coarse: false },
  { viewport: DESKTOP, chatStyle: "flat", coarse: false },
  { viewport: LANDSCAPE_PHONE, chatStyle: "document", coarse: true },
];

const SERVED = [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "chat.listMessageVariants", "rpg.getGame", "rpg.listTurnToolCalls"] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type ListMessagesIntercept = Parameters<typeof serveCorpusProcedures<"chat.listMessages">>[2];

/** A room paged with one-sentence rows in `chatStyle`, and the oldest row its first page shows. */
async function preparePagedRoom(
  caller: Caller,
  chatStyle: ThemeChatStyle,
  appearance: Partial<AppearanceSettings> = { backgroundImageKind: "none" },
): Promise<{ readonly chatId: ChatId; readonly oldestShown: MessageId }> {
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  for (let index = 0; index < WITNESS_ROWS; index++) {
    await caller.chat.commitMessage({
      chatId: room.id,
      content: `History pager witness ${index + 1}. The observatory lantern burns through the rain.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({ chatStyle, ...appearance }) });
  const oldest = (await caller.chat.listMessages({ chatId: room.id })).messages[0];
  if (oldest === undefined) {
    throw new Error("The room's tail is empty");
  }
  return { chatId: room.id, oldestShown: oldest.id };
}

async function seedVariedRows(caller: Caller, chatId: ChatId): Promise<void> {
  for (let row = 0; row < VARIED_ROWS; row += 1) {
    await caller.chat.commitMessage({
      chatId,
      content: `Varied witness ${String(row)}. ${"The observatory lantern burns through the rain. ".repeat(VARIED_ROW_REPEATS[row % VARIED_ROW_REPEATS.length] ?? 1)}`,
      timeZone: UTC_TIME_ZONE,
    });
  }
}

interface PressedRow {
  readonly list: Locator;
  readonly reading: Locator;
  readonly rows: Awaited<ReturnType<typeof loadedRows>>;
  readonly y: number;
}

const PRESS_OUTCOMES = [
  {
    name: "lands",
    fails: false,
    settles: async ({ list, reading, rows, y }: PressedRow): Promise<void> => {
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
    },
  },
  {
    name: "fails",
    fails: true,
    settles: async ({ list, reading }: PressedRow): Promise<void> => {
      await expect(list.getByRole("alert")).toBeInViewport({ ratio: 1 });
      // Home can land at the very top, where the alert takes its height from the rows by rule: the reader must see both.
      await settledBox(reading);
      await expect(reading).toBeInViewport();
    },
  },
] as const;

function pagedRoot(): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  return createCorpusHarness(undefined, { providerFetch: provider.execute });
}

async function serveRoom(page: Page, corpus: Parameters<typeof createShellAmbientReads>[0], caller: Caller, intercept?: ListMessagesIntercept): Promise<void> {
  const viewer = await caller.sessions.me();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, viewer.userId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], intercept),
  });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
}

function earlierIn(list: Locator): Locator {
  return list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
}

/** Parks the reader mid-transcript and moves focus onto Earlier messages, the way a Tab lands there. */
async function focusFromMidway(list: Locator): Promise<void> {
  await expect(earlierIn(list)).toBeAttached();
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
  });
  await earlierIn(list).focus();
  await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
}

/** How far below the port's top the leading action's bottom edge sits; negative while it is scrolled out of view above. */
function plateEdgeIn(list: Locator): Promise<number> {
  return list.evaluate((node) => {
    const plate = node.querySelector('[data-slot="message-list-leading-action"]');
    if (plate === null) {
      throw new Error("the transcript has no leading action");
    }
    return Math.round(plate.getBoundingClientRect().bottom - node.getBoundingClientRect().top);
  });
}

/** The rows the list knows of, from any mounted row. */
function loadedRows(list: Locator): Promise<string | null> {
  return list.locator('[data-slot="message-list-row"]').first().getAttribute("aria-setsize");
}

/** A served room of varied rows, ready to mount. */
async function prepareVariedRoom(page: Page, corpus: Parameters<typeof createShellAmbientReads>[0], caller: Caller): Promise<ChatId> {
  const { chatId } = await preparePagedRoom(caller, "document");
  await seedVariedRows(caller, chatId);
  await serveRoom(page, corpus, caller);
  return chatId;
}

/** Puts focus on the transcript's one tab stop in a mounted room. */
async function focusTabStop(page: Page): Promise<{ readonly list: Locator; readonly focused: Locator }> {
  const list = page.locator('[data-slot="message-list-scroll"]');
  await expect(earlierIn(list)).toBeAttached();
  await list.locator('[data-slot="message-list-row"][tabindex="0"]').focus();
  return { list, focused: list.locator('[data-slot="message-list-row"]:focus') };
}

/** Stamps the document whenever a focus call itself moves the transcript: a walk's position is the virtualizer's alone. */
async function markFocusScrolls(page: Page): Promise<void> {
  await page.addInitScript((mark) => {
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (options): void {
      const port = this.closest('[data-slot="message-list-scroll"]');
      const before = port?.scrollTop;
      focus.call(this, options);
      if (port?.scrollTop !== before) {
        document.documentElement.setAttribute(mark, "");
      }
    };
  }, FOCUS_SCROLL_MARK);
}

/** A row's edges against the scrollport's, and whether it is taller than the scrollport. */
function rowAgainstPort(row: Element): { readonly top: number; readonly bottom: number; readonly tall: boolean } {
  const port = row.closest('[data-slot="message-list-scroll"]')?.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  return { top: box.top - (port?.top ?? Number.NaN), bottom: box.bottom - (port?.bottom ?? Number.NaN), tall: box.height > (port?.height ?? Number.NaN) };
}

function tailDistance(list: Locator): Promise<number> {
  return list.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
}

/** The widest pinned box around a control: nothing else may cover the reading. */
function pinnedInlineSize(control: Element): number {
  let widest = 0;
  for (let box: Element | null = control; box !== null && box.getAttribute("role") !== "log"; box = box.parentElement) {
    if (getComputedStyle(box).position === "sticky") {
      widest = Math.max(widest, box.getBoundingClientRect().width);
    }
  }
  return widest;
}

/** Whether the first filled box around a control is painted with the reading plate. */
function restsOnReadingPlate(control: Element, plateVar: string): boolean {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${plateVar})`;
  control.append(probe);
  const plate = getComputedStyle(probe).backgroundColor;
  probe.remove();
  for (let box = control.parentElement; box !== null; box = box.parentElement) {
    const fill = getComputedStyle(box).backgroundColor;
    if (fill !== "rgba(0, 0, 0, 0)") {
      return fill === plate;
    }
  }
  return false;
}

for (const cell of CELLS) {
  test.describe(`${String(cell.viewport.width)}x${String(cell.viewport.height)} ${cell.chatStyle}`, () => {
    test.use({ viewport: cell.viewport, hasTouch: cell.coarse, isMobile: cell.coarse });

    test("Earlier messages renders once, inside the transcript, and a press moves the reader's row by nothing", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId, oldestShown } = await preparePagedRoom(caller, cell.chatStyle);
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true, includeHidden: true });
      await expect(earlier).toBeAttached();
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true, includeHidden: true })).toHaveCount(1);
      await expect(earlier).not.toBeInViewport();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      const reading = list.locator(`[data-slot="message-row"][data-message-id="${oldestShown}"]`);
      const before = await settledBox(reading);
      await (cell.coarse ? earlier.tap() : earlier.click());
      await expect(list.locator(`[data-slot="message-list-row"]:has([data-message-id="${oldestShown}"])`)).not.toHaveAttribute("data-index", "0");
      const after = await settledBox(reading);
      await test.info().attach("anchor-shift", { body: JSON.stringify({ before: before.y, after: after.y }), contentType: "application/json" });
      expect(after.y - before.y).toBe(0);
    });
  });
}

for (const cell of [
  { viewport: PHONE, coarse: true },
  { viewport: DESKTOP, coarse: false },
]) {
  test.describe(`a history page at ${String(cell.viewport.width)}x${String(cell.viewport.height)}`, () => {
    test.use({ viewport: cell.viewport, hasTouch: cell.coarse, isMobile: cell.coarse });

    for (const textScale of PLATFORM_TEXT_SCALES) {
      for (const landing of [50, 56, 120, 300]) {
        test(`that fails after one jump to ${String(landing)}px at ${String(textScale)}x text holds the reader's row, and so does the retry that lands`, async ({
          corpus,
          mount,
          page,
          browserName,
        }) => {
          test.skip(textScale !== 1 && browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
          await using _textSize = textScale === 1 ? null : await setPlatformTextSize(page, textScale);
          await using root = await pagedRoot();
          const caller = await root.internalCallerFor(root.ownerId);
          const { chatId } = await preparePagedRoom(caller, "document");
          let failing = true;
          await serveRoom(page, corpus, caller, ({ cursor }) => (failing && cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined));
          await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
          const list = page.locator('[data-slot="message-list-scroll"]');
          await expect(earlierIn(list)).toBeAttached();
          await list.evaluate((node, top) => {
            node.scrollTop = top;
          }, landing);
          // The row itself, not the topmost: a landed page can put a new row in the gap above it.
          const reading = list.locator(`[data-slot="message-row"][data-message-id="${(await settledReadingRow(list)).id ?? ""}"]`);
          const { y } = await settledBox(reading);
          const edge = await plateEdgeIn(list);
          await earlierIn(list).dispatchEvent("click");
          await expectPinnedFailure(list);
          // A plate in view keeps the row below its edge as it grows; one that pins from out of view lays over the rows (`reading-row.ts`).
          await expect.poll(async () => (await settledBox(reading)).y - (edge > 0 ? (await plateEdgeIn(list)) - edge : 0)).toBe(y);
          const held = (await settledBox(reading)).y;
          failing = false;
          const rows = await loadedRows(list);
          await earlierIn(list).dispatchEvent("click");
          await expect.poll(() => loadedRows(list)).not.toBe(rows);
          await expect(list.getByRole("alert")).toHaveCount(0);
          // The plate lifts off as the page lands, and moves nothing.
          await expect.poll(async () => (await settledBox(reading)).y).toBe(held);
        });
      }
    }

    for (const outcome of PRESS_OUTCOMES) {
      test(`that ${outcome.name} after Home keeps the reader on the row they walked to`, async ({ corpus, mount, page }) => {
        test.setTimeout(WALK_TIMEOUT_MS);
        await using root = await pagedRoot();
        const caller = await root.internalCallerFor(root.ownerId);
        const { chatId } = await preparePagedRoom(caller, "document");
        await seedVariedRows(caller, chatId);
        await serveRoom(page, corpus, caller, ({ cursor }) => (outcome.fails && cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined));
        await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
        const list = page.locator('[data-slot="message-list-scroll"]');
        await expect(earlierIn(list)).toBeAttached();
        const focused = list.locator('[data-slot="message-list-row"]:focus');
        await list.locator('[data-slot="message-list-row"][tabindex="0"]').focus();
        await page.keyboard.press("Home");
        await expect(focused).toHaveAttribute("data-index", "0");
        const id = await focused.locator('[data-slot="message-row"]').getAttribute("data-message-id");
        const reading = list.locator(`[data-slot="message-row"][data-message-id="${id ?? ""}"]`);
        const { y } = await settledBox(reading);
        const rows = await loadedRows(list);
        await page.keyboard.press("Shift+Tab");
        await expect(earlierIn(list)).toBeFocused();
        await page.keyboard.press("Enter");
        await outcome.settles({ list, reading, rows, y });
      });
    }

    test("follows the tail again once a walk reaches the last row", async ({ corpus, mount, page, viewport }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await seedVariedRows(caller, chatId);
      // Short, so the walk back reaches the tail: a last row taller than the screen opens at its start, away from the tail.
      await caller.chat.commitMessage({ chatId, content: "The last witness.", timeZone: UTC_TIME_ZONE });
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      await list.locator('[data-slot="message-list-row"][tabindex="0"]').focus();
      await page.keyboard.press("ArrowUp");
      await settledBox(list.locator('[data-slot="message-list-row"]:focus'));
      await page.keyboard.press("ArrowDown");
      await settledBox(list.locator('[data-slot="message-list-row"]:focus'));
      // A shrinking scrollport re-pins only a list that is following.
      await page.setViewportSize({ width: viewport?.width ?? PHONE.width, height: (viewport?.height ?? PHONE.height) - SHRINK_PX });
      await expect.poll(() => list.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(SHRINK_PX);
    });

    for (const walk of [
      { key: "ArrowUp", start: "End" },
      { key: "ArrowDown", start: "Home" },
    ] as const) {
      test(`stays out of the way of a ${walk.key} walk from ${walk.start}, every step on screen`, async ({ corpus, mount, page }) => {
        test.setTimeout(WALK_TIMEOUT_MS);
        await markFocusScrolls(page);
        await using root = await pagedRoot();
        const caller = await root.internalCallerFor(root.ownerId);
        const { chatId } = await preparePagedRoom(caller, "document");
        await seedVariedRows(caller, chatId);
        await serveRoom(page, corpus, caller);
        await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
        const list = page.locator('[data-slot="message-list-scroll"]');
        await expect(earlierIn(list)).toBeAttached();
        const focused = list.locator('[data-slot="message-list-row"]:focus');
        await list.locator('[data-slot="message-list-row"][tabindex="0"]').focus();
        await page.keyboard.press(walk.start);
        await expect(focused).toBeInViewport();
        await page.locator("html").evaluate((node, mark) => node.removeAttribute(mark), FOCUS_SCROLL_MARK);
        for (let step = 0; step < WALK_STEPS; step += 1) {
          const from = Number(await focused.getAttribute("data-index"));
          await page.keyboard.press(walk.key);
          await expect(focused).toHaveAttribute("data-index", String(walk.key === "ArrowUp" ? from - 1 : from + 1));
          await expect(focused).toBeInViewport();
          await settledBox(focused);
          await expect(focused).toBeInViewport();
        }
        await expect(page.locator("html")).not.toHaveAttribute(FOCUS_SCROLL_MARK);
      });
    }

    test("is back on the tail, following it, after Home then End across rows it never measured", async ({ corpus, mount, page, viewport }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const { list, focused } = await focusTabStop(page);
      const last = await focused.getAttribute("data-index");
      await page.keyboard.press("Home");
      await expect(focused).toHaveAttribute("data-index", "0");
      await settledBox(focused);
      await page.keyboard.press("End");
      await expect(focused).toHaveAttribute("data-index", last ?? "");
      await expect.poll(() => tailDistance(list)).toBeLessThan(TAIL_PX);
      await settledBox(focused);
      // A shrinking scrollport re-pins only a list that is following.
      await page.setViewportSize({ width: viewport?.width ?? PHONE.width, height: (viewport?.height ?? PHONE.height) - SHRINK_PX });
      await expect.poll(() => tailDistance(list)).toBeLessThan(TAIL_PX);
    });

    for (const walk of [
      { key: "ArrowDown", start: "Home", direction: 1 },
      { key: "ArrowUp", start: "End", direction: -1 },
    ] as const) {
      test(`opens a tall row at its start and meets the next row at the near edge on a ${walk.key} walk`, async ({ corpus, mount, page }) => {
        test.setTimeout(WALK_TIMEOUT_MS);
        await using root = await pagedRoot();
        const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
        await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
        const { focused } = await focusTabStop(page);
        await page.keyboard.press(walk.start);
        await settledBox(focused);
        const landings: ReturnType<typeof rowAgainstPort>[] = [];
        for (let step = 0; step < VARIED_CYCLE; step += 1) {
          const from = Number(await focused.getAttribute("data-index"));
          await page.keyboard.press(walk.key);
          await expect(focused).toHaveAttribute("data-index", String(from + walk.direction));
          await settledBox(focused);
          landings.push(await focused.evaluate(rowAgainstPort));
        }
        const tallRows = landings.filter(({ tall }) => tall);
        expect(tallRows.length).toBeGreaterThan(0);
        expect(Math.max(...tallRows.map(({ top }) => Math.abs(top)))).toBeLessThanOrEqual(1);
        // Off screen before the step: the virtualizer brings it in at the near edge, where the browser's focus scroll would centre it.
        const rowsPastTall = landings.filter(({ tall }, step) => !tall && landings[step - 1]?.tall === true);
        expect(rowsPastTall.length).toBeGreaterThan(0);
        expect(Math.max(...rowsPastTall.map(({ top, bottom }) => Math.abs(walk.direction > 0 ? bottom : top)))).toBeLessThanOrEqual(1);
      });
    }

    test("holds a last row taller than the screen at its start, and the next ArrowDown goes on to the tail", async ({ corpus, mount, page, viewport }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const { list, focused } = await focusTabStop(page);
      await page.keyboard.press("ArrowUp");
      await settledBox(focused);
      await page.keyboard.press("ArrowDown");
      await settledBox(focused);
      const landed = await focused.evaluate(rowAgainstPort);
      expect(landed.tall).toBe(true);
      expect(Math.abs(landed.top)).toBeLessThanOrEqual(1);
      // A shrinking scrollport re-pins only a list that is following.
      await page.setViewportSize({ width: viewport?.width ?? PHONE.width, height: (viewport?.height ?? PHONE.height) - SHRINK_PX });
      await settledBox(focused);
      expect(Math.abs((await focused.evaluate(rowAgainstPort)).top)).toBeLessThanOrEqual(1);
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => tailDistance(list)).toBeLessThan(TAIL_PX);
    });

    test("brings the focused first row back when Home has nowhere else to go", async ({ corpus, mount, page }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const { list, focused } = await focusTabStop(page);
      await page.keyboard.press("Home");
      await settledBox(focused);
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await expect(focused).not.toBeInViewport();
      await page.keyboard.press("Home");
      await expect(focused).toBeInViewport();
    });

    test("leaves the reader where they are when Escape hands focus back to a row taller than the screen", async ({ corpus, mount, page }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const { list, focused } = await focusTabStop(page);
      expect((await focused.evaluate(rowAgainstPort)).tall).toBe(true);
      const index = await focused.getAttribute("data-index");
      await page.keyboard.press("Tab");
      await expect(focused).toHaveCount(0);
      await settledReadingRow(list);
      const before = await list.evaluate((node) => node.scrollTop);
      await page.keyboard.press("Escape");
      await expect(focused).toHaveAttribute("data-index", index ?? "");
      await settledBox(focused);
      expect(await list.evaluate((node) => node.scrollTop)).toBe(before);
    });

    for (const clamp of [
      { key: "Home", start: "Home" },
      { key: "ArrowUp", start: "Home" },
      { key: "End", start: "End" },
      { key: "ArrowDown", start: "End" },
    ] as const) {
      test(`keeps focus on Earlier messages after ${clamp.key} on the row it cannot leave`, async ({ corpus, mount, page }) => {
        test.setTimeout(WALK_TIMEOUT_MS);
        await using root = await pagedRoot();
        const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
        await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
        const { list, focused } = await focusTabStop(page);
        await page.keyboard.press(clamp.start);
        await settledBox(focused);
        const row = await focused.getAttribute("data-index");
        await page.keyboard.press(clamp.key);
        await expect(focused).toHaveAttribute("data-index", row ?? "");
        await settledBox(focused);
        await page.keyboard.press("Shift+Tab");
        await expect(earlierIn(list)).toBeFocused();
        const rows = await loadedRows(list);
        await page.keyboard.press("Enter");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(earlierIn(list)).toBeFocused();
        await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
      });
    }

    test("takes a parked reader's Tab to the first row on screen, not the latest", async ({ corpus, mount, page }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      // A quarter of the way down: the last row can be half the page, and a reader inside it proves nothing.
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 4;
      });
      await settledReadingRow(list);
      await earlierIn(list).focus();
      await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
      const { id } = await settledReadingRow(list);
      await page.keyboard.press("Tab");
      const focused = list.locator('[data-slot="message-list-row"]:focus');
      await expect(focused.locator(`[data-message-id="${id ?? ""}"]`)).toBeAttached();
      await expect(focused).not.toHaveAttribute("data-index", String(Number(await focused.getAttribute("aria-setsize")) - 1));
      await settledBox(focused);
      await expect(focused).toBeInViewport();
    });

    test("takes a Tab back to the row that last had focus", async ({ corpus, mount, page }) => {
      test.setTimeout(WALK_TIMEOUT_MS);
      await using root = await pagedRoot();
      const chatId = await prepareVariedRoom(page, corpus, await root.internalCallerFor(root.ownerId));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const { list, focused } = await focusTabStop(page);
      await page.keyboard.press("ArrowUp");
      await settledBox(focused);
      const walkedTo = await focused.getAttribute("data-index");
      await page.keyboard.press("Shift+Tab");
      await expect(earlierIn(list)).toBeFocused();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      await page.keyboard.press("Tab");
      await expect(focused).toHaveAttribute("data-index", walkedTo ?? "");
      await expect(focused).toBeInViewport();
    });

    test("pressed offline says so and pins, then loads when the connection returns", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      const rows = await loadedRows(list);
      await page.context().setOffline(true);
      await earlierIn(list).dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toHaveText(CHAT_HISTORY_FAILURE_COPY.offline);
      await expect(alert).toBeInViewport({ ratio: 1 });
      await page.context().setOffline(false);
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect(alert).toHaveCount(0);
    });

    test("pressed offline, dismissed, then pressed again says so again", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await settledReadingRow(list);
      // The context outlives the test, so the connection comes back whatever the assertions find.
      await page.context().setOffline(true);
      try {
        await earlierIn(list).dispatchEvent("click");
        const alert = list.getByRole("alert");
        await expect(alert).toBeInViewport({ ratio: 1 });
        const dismiss = list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true });
        await (cell.coarse ? dismiss.tap() : dismiss.click());
        await expect(alert).toHaveCount(0);
        await earlierIn(list).dispatchEvent("click");
        await expect(alert).toBeInViewport({ ratio: 1 });
      } finally {
        await page.context().setOffline(false);
      }
    });

    test(`that fails pins until dismissed by ${cell.coarse ? "a tap" : "a click"}, which removes the failure, and pins again on the next failure`, async ({
      corpus,
      mount,
      page,
    }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      const before = await settledReadingRow(list);
      await earlierIn(list).dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      const dismiss = list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true });
      await (cell.coarse ? dismiss.tap() : dismiss.click());
      await expect(alert).toHaveCount(0);
      await expect(dismiss).toHaveCount(0);
      await expect(earlierIn(list)).toBeFocused();
      await expect.poll(() => settledReadingRow(list)).toEqual(before);
      await earlierIn(list).dispatchEvent("click");
      await expect(alert).toBeInViewport({ ratio: 1 });
    });

    test("that is dismissed at the pager's home removes the failure from the transcript", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(earlierIn(list)).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await earlierIn(list).dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      const dismiss = list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true });
      await (cell.coarse ? dismiss.tap() : dismiss.click());
      await expect(alert).toHaveCount(0);
      await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
    });

    for (const key of ["Enter", "Space"] as const) {
      test(`that is dismissed from the keyboard with ${key} removes the failure and hands focus to Earlier messages`, async ({ corpus, mount, page }) => {
        await using root = await pagedRoot();
        const caller = await root.internalCallerFor(root.ownerId);
        const { chatId } = await preparePagedRoom(caller, "document");
        await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
        await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
        const list = page.locator('[data-slot="message-list-scroll"]');
        await focusFromMidway(list);
        await page.keyboard.press("Enter");
        const dismiss = list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true });
        await dismiss.focus();
        await page.keyboard.press(key);
        await expect(dismiss).toHaveCount(0);
        await expect(earlierIn(list)).toBeFocused();
        // The control keeps its pin for the focus it holds, and the failure has left the transcript.
        await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
        await expect(list.getByRole("alert")).toHaveCount(0);
        await earlierIn(list).blur();
        await expect(list.getByRole("alert")).toHaveCount(0);
      });
    }

    test("sits on the room's track, and the failure and the control share one inset", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      // Dispatched, not clicked: a pointer press would leave the later focus without its ring.
      await earlier.dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      const trackStart = await list
        .locator('[data-track="chat"]')
        .first()
        .evaluate((track) => track.getBoundingClientRect().left);
      const start = (node: Element): number => node.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(node).paddingInlineStart);
      const [control, failure] = await Promise.all([earlier.evaluate(start), alert.evaluate(start)]);
      expect(failure).toBe(control);
      expect(await earlier.evaluate((button) => button.getBoundingClientRect().left)).toBe(trackStart);
      expect(await earlier.evaluate((button) => getComputedStyle(button).boxShadow)).toBe("none");
      await earlier.focus();
      expect(await earlier.evaluate((button) => getComputedStyle(button).boxShadow)).toContain("inset");
      await page.screenshot({ path: test.info().outputPath("on-the-track.png") });
    });

    test("states the end of history in the control's voice, inset from the pager's end", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      for (;;) {
        const rows = await loadedRows(list);
        await earlier.dispatchEvent("click");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(earlier).not.toHaveAttribute("aria-busy", "true");
        if (await earlier.isDisabled()) {
          break;
        }
      }
      await earlier.focus();
      await expect(earlier).toBeFocused();
      // The ring on a disabled control has to read at full strength.
      expect(await earlier.evaluate((button) => getComputedStyle(button).opacity)).toBe("1");
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      const end = page.locator(`[id="${(await earlier.getAttribute("aria-describedby")) ?? ""}"]`);
      await expect(end).toBeVisible();
      const size = (node: Element): string => getComputedStyle(node).fontSize;
      expect(await end.evaluate(size)).toBe(await earlier.evaluate(size));
      const gap = await end.evaluate((node) => {
        const box = node.parentElement?.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(node);
        return (box?.right ?? Number.NaN) - text.getBoundingClientRect().right;
      });
      expect(gap).toBeGreaterThan(0);
      await page.screenshot({ path: test.info().outputPath("end-of-history.png") });
    });

    test("says in its status line what a press does, how many rows each page has loaded, and where history begins", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      const statement = page.locator(`[id="${(await earlier.getAttribute("aria-describedby")) ?? ""}"]`);
      await expect(statement).toHaveRole("status");
      await expect(earlier).toHaveAccessibleDescription(CHAT_HISTORY_PAGER_HINT);
      let loaded = await loadedRows(list);
      for (;;) {
        const rows = loaded;
        await earlier.dispatchEvent("click");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(earlier).not.toHaveAttribute("aria-busy", "true");
        loaded = await loadedRows(list);
        if (await earlier.isDisabled()) {
          break;
        }
        await expect(earlier).toHaveAccessibleDescription(`${CHAT_HISTORY_PAGER_HINT} ${chatHistoryLoadedLabel(Number(loaded))}`);
      }
      await expect(statement).toHaveText(`${CHAT_HISTORY_BEGINNING} ${chatHistoryLoadedLabel(Number(loaded))}`);
      await expect(statement).toHaveRole("status");
    });

    test("that fails at the oldest row leaves the failure and Earlier messages on screen, and a second press recovers", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      let failing = true;
      await serveRoom(page, corpus, caller, ({ cursor }) => (failing && cursor !== undefined ? trpcError({ code: "BAD_REQUEST" }) : undefined));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      const rows = await loadedRows(list);
      await earlier.click();
      await expect(list.getByRole("alert")).toBeInViewport({ ratio: 1 });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: test.info().outputPath("failed-at-the-oldest-row.png") });
      failing = false;
      await earlier.click();
      await expect.poll(() => loadedRows(list)).not.toBe(rows);
      await expect(list.getByRole("alert")).toHaveCount(0);
    });

    test("that fails for a reader mid-transcript shows the failure there, with Earlier messages still holding focus", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      await focusFromMidway(list);
      await page.keyboard.press("Enter");
      await expect(list.getByRole("alert")).toBeInViewport({ ratio: 1 });
      await expect(earlierIn(list)).toBeFocused();
      await expect(earlierIn(list)).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: test.info().outputPath("failed-mid-transcript.png") });
      // The failure stays in view after focus leaves: the reader has not been told anything else.
      await earlierIn(list).blur();
      await expect(list.getByRole("alert")).toBeInViewport({ ratio: 1 });
    });

    test("pages on every Enter, with focus kept, and pins only the control, its ring whole", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await focusFromMidway(list);
      const listWidth = await list.evaluate((node) => node.getBoundingClientRect().width);
      expect(await earlier.evaluate(pinnedInlineSize)).toBeGreaterThan(0);
      expect(await earlier.evaluate(pinnedInlineSize)).toBeLessThan(listWidth / 2);
      expect(await earlier.evaluate((button) => getComputedStyle(button).boxShadow)).toContain("inset");
      await page.screenshot({ path: test.info().outputPath("pinned-control.png") });
      for (let press = 0; press < 2; press += 1) {
        const rows = await loadedRows(list);
        await page.keyboard.press("Enter");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(earlier).toBeFocused();
        await expect(earlier).toBeInViewport({ ratio: 1 });
      }
    });

    test("pinned by the keyboard at the end of history on a plain room, draws an edge between its status line and the rows", async ({
      corpus,
      mount,
      page,
    }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document");
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await focusFromMidway(list);
      while (!(await earlier.isDisabled())) {
        const rows = await loadedRows(list);
        await page.keyboard.press("Enter");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(earlier).not.toHaveAttribute("aria-busy", "true");
      }
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight / 2;
      });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      const pin = list.locator('[data-slot="message-list-leading-action"]');
      expect(await pin.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
      expect(await pin.evaluate((node) => getComputedStyle(node).boxShadow)).toContain("inset");
      await page.screenshot({ path: test.info().outputPath("pinned-end-of-history.png") });
    });

    test("over a wallpaper rests on the reading plate", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document", wallpaper(corpus));
      await serveRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      expect(await earlier.evaluate(restsOnReadingPlate, TOKENS["color.reading-plate"].cssVar)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("over-wallpaper.png") });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      expect(await earlier.evaluate(restsOnReadingPlate, TOKENS["color.reading-plate"].cssVar)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("over-wallpaper-light.png") });
    });

    test("over a wallpaper puts a failure on the opaque card", async ({ corpus, mount, page }) => {
      await using root = await pagedRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId } = await preparePagedRoom(caller, "document", wallpaper(corpus));
      await serveRoom(page, corpus, caller, ({ cursor }) => (cursor === undefined ? undefined : trpcError({ code: "BAD_REQUEST" })));
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = earlierIn(list);
      await expect(earlier).toBeAttached();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await earlier.click();
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      expect(await alert.evaluate(restsOnReadingPlate, TOKENS["color.card"].cssVar)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("failed-over-wallpaper.png") });
    });
  });
}
