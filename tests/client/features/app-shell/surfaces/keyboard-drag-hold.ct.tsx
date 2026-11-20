// With the soft keyboard up, a drag that nothing under the finger can scroll is cancelled, so the page holds still, and every
// drag a scroller can take still scrolls it: the transcript, a sheet, a sideways strip and a composer taller than its box. The
// shell, the room and the sheet are the production ones over a corpus root, on a coarse phone with an iOS-shaped keyboard.
//
// LIMIT: Chromium never pans its visual viewport for a keyboard, so these cases prove which touchmoves the page cancels, not
// that an iPhone's screen holds still. That check is the owner's, on his iPhone.
// @subject packages/client/src/features/app-shell/lib/keyboard-drag-hold.ts
import { YOU_TAB_LABEL } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { emulateSoftKeyboard, ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME, HOME_QUICK_PICKS_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES, touchDrag } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const SHELL_STORY = `${SHELL_STORIES}/AppShellStory`;
const PHONE = { width: 390, height: 844 } as const;
const SHORT_PHONE = { width: 360, height: 560 } as const;
// Roughly an iPhone portrait keyboard with its suggestion bar, and a shorter one that leaves a short sheet some room.
const KEYBOARD_PX = 340;
const SHORT_KEYBOARD_PX = 200;
const DRAG_PX = 160;
// Enough lines that the composer reaches its row cap and scrolls inside itself.
const LONG_DRAFT = Array.from({ length: 40 }, (_, line) => `Line ${String(line + 1)} of a long draft.`).join("\n");
const WITNESS = "keyboardDragWitness";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;

test.use({ hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.listMessages({ chatId: row.id })).previousCursor !== null) {
      roomId = row.id;
      return;
    }
  }
  throw new Error("The corpus has no room with paged history");
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), [
    ...SECTION_PROCEDURES,
    ...ROOM_PROCEDURES,
    "chat.listMessageVariants",
    "rpg.getGame",
    "rpg.listTurnToolCalls",
  ]);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Record on the root, from the window, whether each touchmove reached it cancelled: `1` cancelled, `0` let through. */
async function watchDrags(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const { dataset } = document.documentElement;
    const record = (event: TouchEvent): void => {
      dataset[key] = `${dataset[key] ?? ""}${event.defaultPrevented ? "1" : "0"}`;
    };
    globalThis.addEventListener("touchmove", record, { passive: true });
  }, WITNESS);
}

/** Drag a finger from the middle of `from` by `dx`, `dy`; answers whether the page cancelled any move of it. */
async function dragCancelled(page: Page, from: Locator, delta: { readonly dx: number; readonly dy: number }): Promise<boolean> {
  const box = await from.boundingBox();
  if (box === null) {
    throw new Error("The drag's start has no box");
  }
  await page.evaluate((key) => {
    document.documentElement.dataset[key] = "";
  }, WITNESS);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touchDrag(page, start, { x: start.x + delta.dx, y: start.y + delta.dy });
  const moves = await page.evaluate((key) => document.documentElement.dataset[key] ?? "", WITNESS);
  expect(moves.length).toBeGreaterThan(0);
  return moves.includes("1");
}

async function keyboardUp(page: Page, height: number): Promise<void> {
  await emulateSoftKeyboard(page, height);
  await expect(page.locator(":root")).toHaveAttribute("data-keyboard-up", "");
}

test.describe("in a room", () => {
  test.use({ viewport: PHONE });

  test("the composer and the chrome do not drag, while the transcript and a composer taller than its box still scroll", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    const transcript = page.locator('[data-slot="message-list-scroll"]');
    const topbar = page.locator(".shell-topbar");
    await expect(transcript.locator('[data-slot="message-bubble"]').first()).toBeAttached();
    await watchDrags(page);

    // The keyboard is down: the page leaves a drag on the chrome alone.
    expect(await dragCancelled(page, topbar, { dx: 0, dy: DRAG_PX })).toBe(false);

    await input.focus();
    await keyboardUp(page, KEYBOARD_PX);
    expect(await dragCancelled(page, topbar, { dx: 0, dy: DRAG_PX })).toBe(true);
    expect(await dragCancelled(page, input, { dx: 0, dy: -DRAG_PX })).toBe(true);
    expect(await dragCancelled(page, input, { dx: 0, dy: DRAG_PX })).toBe(true);

    // The transcript opens at its end, so a finger moving down scrolls it back.
    const before = await transcript.evaluate((node) => node.scrollTop);
    expect(await dragCancelled(page, transcript, { dx: 0, dy: DRAG_PX })).toBe(false);
    await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBeLessThan(before);

    // A long draft scrolls inside the composer, from its end back toward its start.
    await input.fill(LONG_DRAFT);
    await expect.poll(() => input.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await input.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    const drafted = await input.evaluate((node) => node.scrollTop);
    expect(await dragCancelled(page, input, { dx: 0, dy: DRAG_PX / 2 })).toBe(false);
    await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeLessThan(drafted);

    await emulateSoftKeyboard(page, 0);
    await expect(page.locator(":root")).not.toHaveAttribute("data-keyboard-up");
    expect(await dragCancelled(page, topbar, { dx: 0, dy: DRAG_PX })).toBe(false);
  });
});

test.describe("on Home", () => {
  test.use({ viewport: PHONE });

  test("a sideways strip still scrolls sideways, and the tab bar does not drag", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(SHELL_STORY, {});
    const faces = page.getByRole("list", { name: HOME_QUICK_PICKS_NAME, exact: true });
    await expect(faces.getByRole("button").first()).toBeVisible();
    const strip = faces.locator("xpath=..");
    await expect.poll(() => strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await watchDrags(page);
    await keyboardUp(page, KEYBOARD_PX);

    expect(await dragCancelled(page, page.locator(".shell-rail"), { dx: 0, dy: -DRAG_PX })).toBe(true);
    // The frame shrank above the keyboard, so the strip is brought into the band the reader still sees.
    await faces.getByRole("button").first().scrollIntoViewIfNeeded();
    await expect(faces.getByRole("button").first()).toBeInViewport();
    const before = await strip.evaluate((node) => node.scrollLeft);
    expect(await dragCancelled(page, faces.getByRole("button").first(), { dx: -DRAG_PX, dy: 0 })).toBe(false);
    await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before);
  });
});

test.describe("in a sheet on a short phone", () => {
  test.use({ viewport: SHORT_PHONE });

  test("the You sheet's body still scrolls under a drag", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(SHELL_STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: YOU_TAB_LABEL, exact: true }).tap();
    const body = page.locator('[data-slot="drawer-content"]');
    await expect(body).toBeVisible();
    await watchDrags(page);
    await keyboardUp(page, SHORT_KEYBOARD_PX);
    await expect.poll(() => body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    expect(await dragCancelled(page, body, { dx: 0, dy: -DRAG_PX })).toBe(false);
    await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  });
});
