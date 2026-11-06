// Earlier messages has one home, the transcript's scroll content, in every regime and chat style. Pressing it keeps the
// reader's row exactly where it was, on rows far shorter than their estimate: the case that loses a late-mounted row's delta.

import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState, settledBox, settledReadingRow } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_DISMISS_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { PHONE, SHELL_STORIES, wallpaper } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const WITNESS_ROWS = 115;
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

/** The rows the list knows of, from any mounted row. */
function loadedRows(list: Locator): Promise<string | null> {
  return list.locator('[data-slot="message-list-row"]').first().getAttribute("aria-setsize");
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
      await earlier.click();
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

    for (const landing of [50, 56, 120, 300]) {
      test(`that fails after one jump to ${String(landing)}px holds the reader's row, and so does the retry that lands`, async ({ corpus, mount, page }) => {
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
        await earlierIn(list).dispatchEvent("click");
        await expect(list.getByRole("alert")).toBeInViewport({ ratio: 1 });
        await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
        failing = false;
        const rows = await loadedRows(list);
        await earlierIn(list).dispatchEvent("click");
        await expect.poll(() => loadedRows(list)).not.toBe(rows);
        await expect(list.getByRole("alert")).toHaveCount(0);
        await expect.poll(async () => (await settledBox(reading)).y).toBe(y);
      });
    }

    test("that fails pins until dismissed, keeps the failure at the pager's home, and pins again on the next failure", async ({ corpus, mount, page }) => {
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
      await settledReadingRow(list);
      await earlierIn(list).dispatchEvent("click");
      const alert = list.getByRole("alert");
      await expect(alert).toBeInViewport({ ratio: 1 });
      const before = await settledReadingRow(list);
      await list.getByRole("button", { name: CHAT_HISTORY_DISMISS_NAME, exact: true }).click();
      await expect(alert).not.toBeInViewport();
      await expect(alert).toBeAttached();
      await expect.poll(() => settledReadingRow(list)).toEqual(before);
      await earlierIn(list).dispatchEvent("click");
      await expect(alert).toBeInViewport({ ratio: 1 });
    });

    test("that is dismissed from the keyboard hands focus to Earlier messages", async ({ corpus, mount, page }) => {
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
      await page.keyboard.press("Enter");
      await expect(dismiss).toHaveCount(0);
      await expect(earlierIn(list)).toBeFocused();
    });

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
        .locator(".orb-chat-track")
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
