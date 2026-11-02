// A paged group room in the short room regime, its hardest shape: the member strip and Earlier messages would sit above
// the transcript, and a long reply's name band pins inside it. A reader opens on story text, the strip and the pager ride
// in the transcript's own scroll content, and a writer keeps Send above the keyboard, on a first open too.

import { testId } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, emulateSoftKeyboard, ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_MESSAGE_INPUT_NAME, CHAT_SEARCH_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const SHELL_STORY = `${SHELL_STORIES}/AppShellStory`;
const LANDSCAPE_PHONE = { width: 844, height: 390 } as const;
const SUBPIXEL = 1;
// A unique title, so the Chats list row that opens the room can be found by what it shows.
const ROOM_TITLE = "Short room witness";
// Long enough for one wheel step's scroll to land, short enough that `toPass` wheels again soon.
const WHEEL_SETTLE_MS = 500;

// Enlarged text in landscape and on a tall phone at 300%: the cells where the room cannot hold its floor and the composer.
const READING_CELLS = [
  { width: 844, height: 390, factor: 2 },
  { width: 844, height: 390, factor: 3 },
  { width: 568, height: 320, factor: 2 },
  { width: 568, height: 320, factor: 3 },
  { width: 390, height: 844, factor: 3 },
] as const;
// The first-open cells the review measured off the room's end, each with the keyboard it used.
const FIRST_OPEN_CELLS = [
  { width: 568, height: 320, factor: 1, keyboard: 170 },
  { width: 320, height: 568, factor: 2, keyboard: 260 },
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;

/** The corpus's paged room with a second character seated: no corpus room is both, and the strip needs two. */
async function seatPagedGroupRoom(): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.listMessages({ chatId: row.id })).previousCursor === null) {
      continue;
    }
    const seated = new Set(
      (await caller.chat.getChat({ chatId: row.id })).participants.flatMap((seat) => (seat.kind === "character" ? [seat.characterId] : [])),
    );
    const guest = (await caller.character.list({})).items.find((character) => !seated.has(character.id));
    if (guest === undefined) {
      throw new Error("The corpus has no character left to seat");
    }
    await caller.chat.addCharacterToChat({ chatId: row.id, characterId: guest.id });
    await caller.chat.updateTitle({ chatId: row.id, title: ROOM_TITLE });
    return row.id;
  }
  throw new Error("The corpus has no room with paged history");
}

test.use({ hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  root = await createCorpusHarness();
  roomId = await seatPagedGroupRoom();
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

const BROWSER_DEFAULT_FONT_PX = 16;

function rootFontPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
}

async function scaleRoot(page: Page, factor: number): Promise<void> {
  await setRootFontScale(page, channelName("fontScale"), factor);
  await expect.poll(() => page.evaluate(rootFontPx)).toBeGreaterThanOrEqual(BROWSER_DEFAULT_FONT_PX * factor);
}

// Scaling back down passes `scaleRoot`'s floor at once, so a crossing waits for the exact root size.
async function scaleRootExactly(page: Page, factor: number): Promise<void> {
  await setRootFontScale(page, channelName("fontScale"), factor);
  await expect.poll(() => page.evaluate(rootFontPx)).toBe(BROWSER_DEFAULT_FONT_PX * factor);
}

/** Scrolls the transcript into its tallest reply, where a pinning name band holds the top. */
function intoTallestReply(list: Element): void {
  const tallest = [...list.querySelectorAll('[data-slot="message-bubble"]')].toSorted(
    (a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height,
  )[0];
  if (tallest === undefined) {
    throw new Error("The room painted no message");
  }
  const box = tallest.getBoundingClientRect();
  list.scrollTop += box.top + box.height / 2 - list.getBoundingClientRect().top;
}

interface ReadingWindow {
  readonly listTop: number;
  readonly roomTop: number;
  readonly roomHeight: number;
  readonly composerTop: number;
  /** The pinned name band's share of the transcript's top edge. */
  readonly band: number;
  /** The transcript's height inside the room's visible box, less the band. */
  readonly readable: number;
}

function readingWindow(list: Element, subpixel: number): ReadingWindow {
  const room = list.closest('[data-slot="chat-room-surface"]');
  if (room === null) {
    throw new Error("The transcript is not inside a room");
  }
  const composer = room.querySelector('[data-slot="composer"]');
  if (composer === null) {
    throw new Error("The room has no composer");
  }
  const frame = room.getBoundingClientRect();
  const box = list.getBoundingClientRect();
  const pinned = [...list.querySelectorAll("[data-pinned]")].filter((header) => Math.abs(header.getBoundingClientRect().top - box.top) <= 2 * subpixel);
  const band = Math.max(0, ...pinned.map((header) => header.getBoundingClientRect().bottom - box.top));
  const readable = Math.max(0, Math.min(box.bottom, frame.bottom) - Math.max(box.top, frame.top) - band);
  return { listTop: box.top, roomTop: frame.top, roomHeight: frame.height, composerTop: composer.getBoundingClientRect().top, band, readable };
}

/** Whether a control paints whole inside the visual viewport, the part of the screen a soft keyboard leaves. */
function aboveKeyboard(control: Element, subpixel: number): boolean {
  const box = control.getBoundingClientRect();
  const top = visualViewport?.offsetTop ?? 0;
  return box.top >= top - subpixel && box.bottom <= top + (visualViewport?.height ?? innerHeight) + subpixel;
}

/** One wheel step over the transcript's centre, a box height down (1) or up (-1): CT's raw wheel, with no hover first. */
async function wheelOver(list: Locator, direction: 1 | -1): Promise<void> {
  const box = await list.boundingBox();
  if (box === null) {
    throw new Error("The transcript has no box");
  }
  await list.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await list.page().mouse.wheel(0, direction * box.height);
}

/** The short room's pointer copy of Earlier messages, inside the transcript and hidden from assistive tech. */
function pointerEarlier(list: Locator): Locator {
  return list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true, includeHidden: true });
}

/** The keyboard copy: the one a Tab or a screen reader reaches, outside the transcript. */
function keyboardEarlier(page: Page): Locator {
  return page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
}

/** The message at the transcript's top edge, by id, with the share of it above the edge. */
function readingRow(list: Element): { readonly id: string | null; readonly into: number } {
  const edge = list.getBoundingClientRect().top;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-slot="message-row"]')]
    .map((row) => ({ row, box: row.getBoundingClientRect() }))
    .filter(({ box }) => box.bottom > edge && box.height > 0)
    .toSorted((a, b) => a.box.top - b.box.top);
  const top = rows[0];
  return top === undefined ? { id: null, into: 0 } : { id: top.row.dataset["messageId"] ?? null, into: (edge - top.box.top) / top.box.height };
}

/** Parks the reader mid-transcript, the way a scroll leaves them, and returns the row they read. */
async function parkMidway(list: Locator): Promise<string | null> {
  await expect(list.locator('[data-slot="message-row"]').first()).toBeAttached();
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
  });
  return settledReadingRow(list);
}

/** The row at the transcript's top edge once it reads the same on two polls running. */
async function settledReadingRow(list: Locator): Promise<string | null> {
  let parked: string | null = null;
  await expect
    .poll(async () => {
      const now = (await list.evaluate(readingRow)).id;
      const still = now === parked;
      parked = now;
      return still && now !== null;
    })
    .toBe(true);
  return parked;
}

async function wheelOverUntilShown(list: Locator, control: Locator): Promise<void> {
  await expect(async () => {
    await wheelOver(list, -1);
    await expect(control).toBeInViewport({ ratio: 1, timeout: WHEEL_SETTLE_MS });
  }).toPass();
}

test.describe("a paged group room on a landscape phone at normal text", () => {
  test.use({ viewport: LANDSCAPE_PHONE });

  test("opens on the transcript and the composer, and the strip and Earlier messages scroll with the transcript, never over it", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
    const list = page.locator('[data-slot="message-list-scroll"]');
    const earlier = pointerEarlier(list);
    // The copy of the strip the room paints inside the transcript.
    const strip = list.getByTestId(testId("chatCharacterBar"));
    await expect(input).toBeVisible();
    await expect(earlier).toBeAttached();
    await list.evaluate(intoTallestReply);
    const gap = await resolvedLength(page, `var(${TOKENS["spacing.field"].cssVar})`);
    // With the band pinned, the reader keeps everything from the room's top edge to the composer, less the band itself:
    // the reading height a solo room gets, with the band open.
    await expect.poll(() => list.evaluate(readingWindow, SUBPIXEL).then((facts) => facts.band)).toBeGreaterThan(0);
    const reading = await list.evaluate(readingWindow, SUBPIXEL);
    await test.info().attach("reading-window", { body: JSON.stringify(reading), contentType: "application/json" });
    expect({
      startsAtRoomTop: Math.abs(reading.listTop - reading.roomTop) <= SUBPIXEL,
      readsToComposer: reading.readable >= reading.composerTop - gap - reading.roomTop - reading.band - SUBPIXEL,
    }).toEqual({ startsAtRoomTop: true, readsToComposer: true });
    await expect(send).toBeInViewport({ ratio: 1 });
    await expect(earlier).not.toBeInViewport();
    // Scrolling up past the oldest loaded row brings the pager and the strip into view, with Send still on screen.
    await list.evaluate((node) => {
      node.scrollTop = 0;
    });
    await wheelOverUntilShown(list, earlier);
    await wheelOverUntilShown(list, strip);
    await expect(send).toBeInViewport({ ratio: 1 });
    // The first swipe down takes them away with the oldest rows: nothing is left over the reading, and Send stays.
    await wheelOver(list, 1);
    await expect(earlier).not.toBeInViewport();
    await expect(strip).not.toBeInViewport();
    await expect(send).toBeInViewport({ ratio: 1 });
    const after = await list.evaluate(readingWindow, SUBPIXEL);
    expect(Math.abs(after.listTop - after.roomTop)).toBeLessThanOrEqual(SUBPIXEL);
  });

  test("Earlier messages, pressed inside the transcript, loads older rows without moving the row the reader was on", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const list = page.locator('[data-slot="message-list-scroll"]');
    const earlier = pointerEarlier(list);
    await expect(earlier).toBeAttached();
    await list.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(earlier).toBeInViewport({ ratio: 1 });
    const first = list.locator('[data-slot="message-row"]').first();
    const id = await first.getAttribute("data-message-id");
    const row = list.locator(`[data-slot="message-row"][data-message-id="${id ?? ""}"]`);
    const before = await row.boundingBox();
    await earlier.click();
    await expect.poll(() => list.locator('[data-slot="message-row"]').first().getAttribute("data-message-id")).not.toBe(id);
    await expect
      .poll(async () => {
        const settled = await row.boundingBox();
        return settled === null || before === null ? Number.POSITIVE_INFINITY : Math.abs(settled.y - before.y);
      })
      .toBeLessThanOrEqual(SUBPIXEL);
  });
});

test.describe("a keyboard reader parked mid-transcript on a landscape phone", () => {
  test.use({ viewport: LANDSCAPE_PHONE });

  test("reaches Earlier messages outside the transcript, on screen, and the transcript keeps the row they were reading", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const list = page.locator('[data-slot="message-list-scroll"]');
    const parked = await parkMidway(list);
    const earlier = keyboardEarlier(page);
    await earlier.focus();
    await expect(earlier).toBeFocused();
    await expect(earlier).toBeInViewport({ ratio: 1 });
    expect(await earlier.evaluate((button) => button.closest('[role="log"]') === null)).toBe(true);
    await expect.poll(() => list.evaluate(readingRow).then((row) => row.id)).toBe(parked);
  });
});

// A tall phone at normal text is the tall regime; 200% text takes it into the short one, and back.
test.describe("a reader on a tall phone whose text size crosses the short room's step", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the row they were reading through each crossing", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const list = page.locator('[data-slot="message-list-scroll"]');
    const parked = await parkMidway(list);
    for (const factor of [2, 1, 2, 1]) {
      await scaleRootExactly(page, factor);
      expect(await settledReadingRow(list)).toBe(parked);
    }
  });

  test("keeps focus on Earlier messages through each crossing", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
    const earlier = keyboardEarlier(page);
    await earlier.focus();
    await expect(earlier).toBeFocused();
    for (const factor of [2, 1]) {
      await scaleRootExactly(page, factor);
      await expect(earlier).toBeFocused();
      await expect(earlier).toBeInViewport({ ratio: 1 });
    }
  });
});

forEachNonEmpty(READING_CELLS, "READING_CELLS", (cell) => {
  test.describe(`a reader at ${String(cell.factor * 100)}% text on ${String(cell.width)}x${String(cell.height)}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height } });

    test("opens on story text, with the transcript's floor or the whole room to read", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
      await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeAttached();
      await scaleRoot(page, cell.factor);
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect(list.locator('[data-slot="message-bubble"]').first()).toBeAttached();
      const floor = await resolvedLength(page, `var(${TOKENS["height.scroll-sm"].cssVar})`);
      await expect
        .poll(async () => {
          const reading = await list.evaluate(readingWindow, SUBPIXEL);
          return reading.readable + reading.band >= Math.min(floor, reading.roomHeight) - SUBPIXEL;
        })
        .toBe(true);
    });
  });
});

forEachNonEmpty(FIRST_OPEN_CELLS, "FIRST_OPEN_CELLS", (cell) => {
  test.describe(`a first open from the Chats list at ${String(cell.factor * 100)}% text on ${String(cell.width)}x${String(cell.height)}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height } });

    test("keeps the field and Send above the keyboard once the reader starts writing", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellStory>(SHELL_STORY, {});
      await scaleRoot(page, cell.factor);
      // A press on the row is the first-open path: arrival focus moves into the room, which a direct mount never does.
      // The Chats list is a virtual window, so the room is found the way a reader finds it: by searching for it.
      await page.getByLabel(CHAT_SEARCH_NAME, { exact: true }).fill(ROOM_TITLE);
      await page.getByText(ROOM_TITLE, { exact: true }).first().click();
      const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
      await expect(input).toBeAttached();
      await expect(page.locator('[data-slot="message-list-scroll"] [data-slot="message-bubble"]').first()).toBeAttached();
      await input.focus();
      await emulateSoftKeyboard(page, cell.keyboard);
      const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
      await expect.poll(() => Promise.all([input.evaluate(aboveKeyboard, SUBPIXEL), send.evaluate(aboveKeyboard, SUBPIXEL)])).toEqual([true, true]);
      await emulateSoftKeyboard(page, 0);
    });
  });
});
