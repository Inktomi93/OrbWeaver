// A paged group room on a landscape phone, the short room's hardest shape: the member strip and Earlier messages sit above
// the transcript, and a long reply's name band would pin inside it. The room opens on the transcript and the composer
// alone, and the chrome scrolls back in when a swipe carries on past the transcript's top.

import { testId } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const LANDSCAPE_PHONE = { width: 844, height: 390 } as const;
const SUBPIXEL = 1;
// A swipe's worth of wheel travel, larger than the chrome it has to bring back.
const WHEEL_STEP_PX = 400;
// Long enough for one wheel step's scroll to land, short enough that `toPass` wheels again soon.
const WHEEL_SETTLE_MS = 500;

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
    return row.id;
  }
  throw new Error("The corpus has no room with paged history");
}

test.use({ viewport: LANDSCAPE_PHONE, hasTouch: true, isMobile: true });

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

/** Scrolls the transcript into its tallest reply, where a pinning name band would hold the top. */
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
  const readable = Math.min(box.bottom, frame.bottom) - Math.max(box.top, frame.top) - band;
  return { listTop: box.top, roomTop: frame.top, composerTop: composer.getBoundingClientRect().top, band, readable };
}

/** Wheels over the transcript until `control` is whole on screen, the way a swipe carries on past the list's top. */
async function wheelUntilShown(list: Locator, control: Locator): Promise<void> {
  const box = await list.boundingBox();
  if (box === null) {
    throw new Error("The transcript has no box");
  }
  await list.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(async () => {
    await list.page().mouse.wheel(0, -WHEEL_STEP_PX);
    await expect(control).toBeInViewport({ ratio: 1, timeout: WHEEL_SETTLE_MS });
  }).toPass();
}

test("on a landscape phone a paged group room opens on the transcript and the composer, and the chrome scrolls back in above it", async ({ mount, page }) => {
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: roomId });
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  const earlier = page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
  const strip = page.getByTestId(testId("chatCharacterBar"));
  await expect(input).toBeVisible();
  await expect(earlier).toBeAttached();
  await expect(strip).toBeAttached();
  const list = page.locator('[data-slot="message-list-scroll"]');
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
  await expect(page.getByRole("button", { name: CHAT_SEND_NAME, exact: true })).toBeInViewport({ ratio: 1 });
  await expect(earlier).not.toBeInViewport();
  await expect(strip).not.toBeInViewport();
  // Past the transcript's top, the same swipe brings back the paging chrome and then the member strip.
  await list.evaluate((node) => {
    node.scrollTop = 0;
  });
  await wheelUntilShown(list, earlier);
  await wheelUntilShown(list, strip);
});
