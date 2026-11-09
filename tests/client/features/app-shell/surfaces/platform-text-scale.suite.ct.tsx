// The topbar, the room and the character Import dialog on the production shell at enlarged text: 200% (WCAG 1.4.4 text
// resize) and 300% layout, at the phone and desktop viewports, on Chromium and the opt-in WebKit project. The appearance
// setting is bounded by `FONT_SCALE`, so these scales are the root multiplier the writer carries; `:root { font-size }` multiplies it the
// same way, but a `rem` inside a media query stays at the platform default, so a browser whose own default is 200% would
// also flip the shell regime. Every surface runs every cell of EVERY_CELL; an exception is named beside it in QUALIFIED.

import { BLANK_CHAT_NAME, CHAT_NAME_FIELD_NAME, contextToggleLabel, testId } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { enlargedTextFindings as findings, LAYOUT_SUBPIXEL_PX as SUBPIXEL, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { absenceWindow, channelName, emulateSoftKeyboard, ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { CHARACTER_EDITOR_NAME } from "#client/features/character/lib/character-names.ts";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { CHAT_ADD_CHARACTER_NAME } from "#client/features/chat/lib/members-names.ts";
import { CHAT_PRINT_COVERAGE } from "#client/features/chat/lib/transcript-copy.ts";
import type { AppShellCharacterStory, AppShellModalStory, AppShellRoomStory, AppShellStory, AppShellTemporaryNewChatStory } from "./_app-shell-stories.tsx";
import type { PlantedControlsStory, PlantedCoverStory } from "./_text-scale-probe-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const PROBE_STORIES = "tests/client/features/app-shell/surfaces/_text-scale-probe-stories";
const PHONE = { name: "phone", touch: true, size: { width: 390, height: 844 } } as const;
const NARROW = { name: "narrow phone", touch: true, size: { width: 320, height: 568 } } as const;
const DESKTOP = { name: "desktop", touch: false, size: { width: 1440, height: 900 } } as const;
const TEXT_200 = { name: "200% text", factor: 2 } as const;
const LAYOUT_300 = { name: "300% layout", factor: 3 } as const;
// The widest root at which the desktop topbar still shows the wide identity that renames a room.
const TEXT_125 = { name: "125% text", factor: 1.25 } as const;
const IMPORT_DOOR = /^Import/u;
const BAND_MENU_TRIGGER = '[data-slot="list-pane-action"] [data-slot="overflow-actions-trigger"]';
const TRAIL_MENU_TRIGGER = '.shell-topbar-trail [data-slot="overflow-actions-trigger"]';
const FONT_SCALE_PROPERTY = channelName("fontScale");
const DOOR_TIMEOUT_MS = 2000;

type Viewport = typeof PHONE | typeof NARROW | typeof DESKTOP;
type Scale = typeof TEXT_125 | typeof TEXT_200 | typeof LAYOUT_300;
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const EVERY_CELL = [
  [PHONE, TEXT_200],
  [PHONE, LAYOUT_300],
  [DESKTOP, TEXT_200],
  [DESKTOP, LAYOUT_300],
] as const satisfies readonly (readonly [Viewport, Scale])[];

// 300% on the narrowest phone leaves under seven rem of width: two touch targets and their gap do not fit one row.
const NARROW_CELL = [NARROW, TEXT_200] as const satisfies readonly [Viewport, Scale];

const ROOM_PANEL_PROCEDURES = [
  ...SECTION_PROCEDURES,
  ...ROOM_PROCEDURES,
  "chat.listForks",
  "chat.listMessageVariants",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "rpg.getTrackerView",
  "rpg.getConfigView",
  "rpg.listJournal",
  "rpg.revealHidden",
] as const;
// A height a reader can scan: the phone's 200% header leaves a little under half of its transcript, and that reads.
const READING_SHARE = 0.4;
// The transcript at 300% on a phone: a word split without a hyphen stays the exception, not one in eleven.
const SPLIT_WORD_SHARE = 0.03;
const LONG_REPLY = Array.from({ length: 24 }, () => "The traveller witnesses the orbital loom and walks the long gallery beside the keeper.").join(" ");
const TYPED_DRAFT = "A draft long enough to fill the field past its second line, so the line being typed is the last one.";
// Keyboards that leave the phone about 500px and the narrow phone 308px: the room's field and Send must stay above them.
const KEYBOARD_HEIGHT: Partial<Record<Viewport["name"], number>> = { [PHONE.name]: 340, [NARROW.name]: 260 };

const QUALIFIED = {
  readingWindow: EVERY_CELL,
  topbar: [...EVERY_CELL, NARROW_CELL],
  contextHeader: EVERY_CELL,
  roomContext: [...EVERY_CELL, NARROW_CELL],
  gameRoomMembers: EVERY_CELL,
  focusedField: [...EVERY_CELL, NARROW_CELL],
  screenName: [...EVERY_CELL, NARROW_CELL],
  importOpen: EVERY_CELL,
  newChat: EVERY_CELL,
  // At 200% on the desktop the trail keeps every action in the row, so it renders no menu to measure.
  topbarMenu: [
    [PHONE, TEXT_200],
    [PHONE, LAYOUT_300],
    [DESKTOP, LAYOUT_300],
  ],
  // The sheet is the phone tab bar's: a desktop has the rail's own doors.
  youSheet: [
    [PHONE, TEXT_200],
    [PHONE, LAYOUT_300],
  ],
  listPanel: [...EVERY_CELL, NARROW_CELL],
  roomHeader: EVERY_CELL,
  room: [...EVERY_CELL, NARROW_CELL],
  jumpToLatest: EVERY_CELL,
  phoneTabs: [
    [PHONE, TEXT_200],
    [PHONE, LAYOUT_300],
    [NARROW, TEXT_200],
    [NARROW, LAYOUT_300],
  ],
  presetsWelcome: EVERY_CELL,
  // The 320 phone is where these labels outgrow the pane at 300%; the 390 phone is the control beside it.
  emptyStateActions: [
    [PHONE, LAYOUT_300],
    [NARROW, LAYOUT_300],
  ],
  importDialog: EVERY_CELL,
  characterEditor: EVERY_CELL,
  saveBarName: [
    [NARROW, TEXT_200],
    [NARROW, LAYOUT_300],
  ],
  echoFoot: EVERY_CELL,
  // Only the wide identity renames; from 200% the desktop row has swapped to the screen name.
  renameField: [[DESKTOP, TEXT_125]],
} as const satisfies Record<string, readonly (readonly [Viewport, Scale])[]>;

// How many of the composer row's movable actions sit in the Message tools menu in each room case, as measured.
const COMPOSER_MOVED_COUNT: Record<string, number> = {
  [`${DESKTOP.name} ${TEXT_200.name}`]: 0,
  [`${PHONE.name} ${TEXT_200.name}`]: 2,
  [`${PHONE.name} ${LAYOUT_300.name}`]: 3,
  [`${DESKTOP.name} ${LAYOUT_300.name}`]: 3,
  [`${NARROW.name} ${TEXT_200.name}`]: 3,
};

let root: Root;
let longRoomId: ChatId;
let gameRoomId: ChatId;
let pagedRoom: Promise<ChatId> | undefined;

/** A corpus room whose last turn is a long reply, so its swipe foot sits past a reading window. */
async function seedLongReplyRoom(): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const reply = (await caller.chat.listMessages({ chatId: row.id })).messages.at(-1);
    if (reply?.role === "assistant") {
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content: LONG_REPLY, timeZone: UTC_TIME_ZONE });
      return row.id;
    }
  }
  throw new Error("The corpus has no room that ends on a reply");
}

/** A corpus room with older history behind its loaded page. Stops at the first: every read here spends the harness's rate limit. */
function findPagedRoom(): Promise<ChatId> {
  pagedRoom ??= scanForPagedRoom();
  return pagedRoom;
}

async function scanForPagedRoom(): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.listMessages({ chatId: row.id })).previousCursor !== null) {
      return row.id;
    }
  }
  throw new Error("The corpus has no room with paged history");
}

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  longRoomId = await seedLongReplyRoom();
  gameRoomId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId: gameRoomId, mode: "lite", ruleset: "d20" });
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), ROOM_PANEL_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The words a line break cut in two: each word's text range paints on more than one line. */
function splitWords(subject: Element): { readonly total: number; readonly split: readonly string[] } {
  const walker = document.createTreeWalker(subject, NodeFilter.SHOW_TEXT);
  const split: string[] = [];
  let total = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    for (const word of (node.textContent ?? "").matchAll(/\S+/gu)) {
      const range = document.createRange();
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      total += 1;
      if (new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size > 1) {
        split.push(word[0]);
      }
    }
  }
  return { total, split };
}

/** Pairs of a save bar's painted parts that intersect: the title, the kind label, the diagnostic and the status take lines of their own, never one another's. */
function overlappingParts(bar: Element, subpixel: number): string[] {
  const parts = [...bar.querySelectorAll("[data-slot]")].filter((part) =>
    part.matches('[data-slot="save-bar-title"], [data-slot="save-bar-kind"], [data-slot="save-bar-meta"], [data-slot="save-bar-actions"]'),
  );
  return parts.flatMap((part, index) =>
    parts.slice(index + 1).flatMap((other) => {
      const [a, b] = [part.getBoundingClientRect(), other.getBoundingClientRect()];
      const inline = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const block = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return inline > subpixel && block > subpixel ? [`${part.getAttribute("data-slot")} overlaps ${other.getAttribute("data-slot")}`] : [];
    }),
  );
}

/** What takes a press at a control's centre instead of the control, or null when the control takes it. */
function coverOf(button: Element): string | null {
  const box = button.getBoundingClientRect();
  const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  // A disabled control takes no press itself, so its own row answering is the row leaving it uncovered.
  const inert = getComputedStyle(button).pointerEvents === "none" && top === button.parentElement;
  return (top !== null && button.contains(top)) || inert ? null : `${top?.getAttribute("data-slot") ?? top?.tagName ?? "nothing"} ${top?.className ?? ""}`;
}

/** Whether a control paints whole inside the visual viewport, the part of the screen a soft keyboard leaves. */
function aboveKeyboard(control: Element, subpixel: number): boolean {
  const box = control.getBoundingClientRect();
  const top = visualViewport?.offsetTop ?? 0;
  return box.top >= top - subpixel && box.bottom <= top + (visualViewport?.height ?? innerHeight) + subpixel;
}

/** The share of the transcript left to read once a pinned header has taken its place, scrolled into the long reply. */
function readableShare(list: Element, subpixel: number): number {
  const rows = [...list.querySelectorAll('[data-slot="message-bubble"]')];
  const tallest = rows.toSorted((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (tallest === undefined) {
    throw new Error("The room painted no message");
  }
  const box = tallest.getBoundingClientRect();
  list.scrollTop += box.top + box.height / 2 - list.getBoundingClientRect().top;
  const top = list.getBoundingClientRect().top;
  const atTop = [...list.querySelectorAll("[data-pinned]")].filter((header) => Math.abs(header.getBoundingClientRect().top - top) <= subpixel);
  const covered = Math.max(0, ...atTop.map((header) => header.getBoundingClientRect().bottom - top));
  return (list.clientHeight - covered) / list.clientHeight;
}

async function scaleRoot(page: Page, factor: number): Promise<void> {
  // !important: the appearance writer owns the inline value and rewrites it after boot.
  await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
}

/** Writes the owner's chat style, which the shell's served reads pick up on the next mount. */
async function setChatStyle(chatStyle: ThemeChatStyle): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle } });
}

async function firstCharacterId(): Promise<CharacterId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const [character] = (await caller.character.list({})).items;
  if (character === undefined) {
    throw new Error("The corpus has no character");
  }
  return character.id;
}

/** Mounts the production shell on one room, opened the way a Chats row opens it, and returns its message field. */
async function openRoom(mountRoom: (chatId: ChatId) => Promise<unknown>, page: Page, chatId: ChatId): Promise<Locator> {
  await seedShellState(page, { activeSection: "chats" });
  await mountRoom(chatId);
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await expect(input).toBeVisible();
  return input;
}

const openLongRoom = (mountRoom: (chatId: ChatId) => Promise<unknown>, page: Page): Promise<Locator> => openRoom(mountRoom, page, longRoomId);
const openGameRoom = (mountRoom: (chatId: ChatId) => Promise<unknown>, page: Page): Promise<Locator> => openRoom(mountRoom, page, gameRoomId);

/** Opens the Context panel through whichever door the topbar kept: its toggle in the row, or its item in the row's menu. */
async function openContextPanel(page: Page): Promise<void> {
  const panel = page.locator(".shell-panel[data-panel-side='context']");
  if ((await panel.getAttribute("data-panel-mode")) !== "collapsed") {
    return;
  }
  const name = contextToggleLabel(true);
  const toggle = page.getByRole("button", { name, exact: true });
  const trigger = page.locator(TRAIL_MENU_TRIGGER);
  // The row settles a frame after the scale lands, so a door seen a moment ago may have moved into the menu.
  await expect(async () => {
    await page.keyboard.press("Escape");
    if (await toggle.isVisible()) {
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await toggle.click({ timeout: DOOR_TIMEOUT_MS });
    } else {
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await trigger.click({ timeout: DOOR_TIMEOUT_MS });
      // eslint-disable-next-line playwright/no-action-timeout -- a door that moved must fail fast so `toPass` can retry the other one.
      await page.getByRole("menuitem", { name, exact: true }).click({ timeout: DOOR_TIMEOUT_MS });
    }
    await expect(panel).not.toHaveAttribute("data-panel-mode", "collapsed", { timeout: DOOR_TIMEOUT_MS });
  }).toPass();
}

/** A length token at the current root, read off a planted box the way the browser resolves it. */
function resolvedBlockSize(page: Page, length: string): Promise<number> {
  return page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.blockSize = value;
    document.body.append(probe);
    const { height } = probe.getBoundingClientRect();
    probe.remove();
    return height;
  }, length);
}

const documentOverflow = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

for (const [viewport, scale] of QUALIFIED.topbar) {
  test.describe(`topbar at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every control reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-topbar")).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect.poll(() => findings(page.locator(".shell-topbar"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.contextHeader) {
  test.describe(`Context panel header at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every control reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: await firstCharacterId() });
      await scaleRoot(page, scale.factor);
      await openContextPanel(page);
      await expect(page.locator(".shell-panel[data-panel-side='context'] [data-slot='context-bracket-header']")).toBeVisible();
      await expect.poll(() => findings(page.locator(".shell-panel[data-panel-side='context']"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.roomContext) {
  test.describe(`room Context panel at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every control reachable", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await scaleRoot(page, scale.factor);
      await openContextPanel(page);
      const panel = page.locator(".shell-panel[data-panel-side='context']");
      await expect(panel.locator("[data-slot='context-bracket-header']")).toBeInViewport();
      await expect.poll(() => findings(panel)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.gameRoomMembers) {
  test.describe(`Members in a game room at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the roster's body and its doors reachable", async ({ mount, page }) => {
      await openGameRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
      await scaleRoot(page, scale.factor);
      await openContextPanel(page);
      const panel = page.locator(".shell-panel[data-panel-side='context']");
      await panel.getByRole("tab", { name: /^Members/u }).click();
      const door = panel.getByRole("button", { name: CHAT_ADD_CHARACTER_NAME, exact: true });
      await door.scrollIntoViewIfNeeded();
      await expect(door).toBeInViewport({ ratio: 0.5 });
      await expect.poll(() => door.evaluate(coverOf)).toBeNull();
      await expect.poll(() => findings(panel)).toEqual([]);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.readingWindow) {
  test.describe(`reading a long reply at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("leaves the transcript to the reply and keeps the swipe foot pressable", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await expect(page.locator('[data-slot="message-bubble"]').last()).toBeVisible();
      await scaleRoot(page, scale.factor);
      const list = page.locator('[data-slot="message-list-scroll"]');
      await expect.poll(() => list.evaluate(readableShare, 2 * SUBPIXEL)).toBeGreaterThanOrEqual(READING_SHARE);
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const foot = page.locator('[data-slot="swipe-strip"]');
      await foot.scrollIntoViewIfNeeded();
      // The foot's two chevrons, in reading order; the second is a step or the paid generate, by position in the history.
      for (const button of [foot.getByRole("button").first(), foot.getByRole("button").last()]) {
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1 });
        await expect.poll(() => button.evaluate(coverOf)).toBeNull();
      }
    });
  });
}

test.describe("the transcript at 300% layout on the phone", () => {
  test.use({ viewport: PHONE.size, hasTouch: true, isMobile: true });

  test("breaks between words, with a split word the exception", async ({ mount, page }) => {
    await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
    await scaleRoot(page, LAYOUT_300.factor);
    const { total, split } = await page.locator('[data-slot="message-list-scroll"]').evaluate(splitWords);
    expect(split.length / total).toBeLessThanOrEqual(SPLIT_WORD_SHARE);
  });
});

for (const [viewport, scale] of QUALIFIED.focusedField) {
  test.describe(`writing at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the field clear of the controls and every line being typed in view", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
      await expect(input).toBeVisible();
      await scaleRoot(page, scale.factor);
      await input.focus();
      const keyboard = KEYBOARD_HEIGHT[viewport.name] ?? 0;
      await emulateSoftKeyboard(page, keyboard);
      await input.fill(TYPED_DRAFT);
      await expect.poll(() => findings(page.locator('[data-slot="composer"]'))).toEqual([]);
      // Measured against the visual viewport, which the keyboard shortens; the layout viewport keeps its full height under it.
      // Nothing is scrolled first: the room has to open the composer above the keyboard by itself.
      const send = page.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
      await expect.poll(() => Promise.all([input.evaluate(aboveKeyboard, SUBPIXEL), send.evaluate(aboveKeyboard, SUBPIXEL)])).toEqual([true, true]);
      await emulateSoftKeyboard(page, 0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.screenName) {
  test.describe(`the screen's name at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    const nameFloor = (page: Page): Promise<number> =>
      page.evaluate((length) => {
        const probe = document.createElement("span");
        probe.style.cssText = `position:absolute;visibility:hidden;inline-size:${length}`;
        document.querySelector(".shell-topbar")?.append(probe);
        const { width } = probe.getBoundingClientRect();
        probe.remove();
        return width;
      }, `var(${TOKENS["dimension.shell-title-floor"].cssVar})`);
    // A named screen paints at least half the title floor somewhere on screen, in the topbar or the list's band.
    const named = (page: Page): Promise<number> =>
      page.evaluate(() => {
        const names = [
          ...document.querySelectorAll(".shell-topbar-title, .shell-topbar-identity h1, .shell-topbar-identity h2, [data-slot='list-pane-title']"),
        ];
        return Math.max(
          0,
          ...names
            .filter((name) => name.checkVisibility({ visibilityProperty: true }) && name.textContent.trim() !== "")
            .map((name) => {
              const box = name.getBoundingClientRect();
              return Math.min(box.right, innerWidth) - Math.max(box.left, 0);
            }),
        );
      });

    test("names a section's roster on screen", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-topbar")).toBeVisible();
      await scaleRoot(page, scale.factor);
      const floor = await nameFloor(page);
      await expect.poll(() => named(page)).toBeGreaterThanOrEqual(floor / 2);
    });

    test("names a room on screen, where a phone has no tab bar", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
      await scaleRoot(page, scale.factor);
      const floor = await nameFloor(page);
      await expect.poll(() => named(page)).toBeGreaterThanOrEqual(floor / 2);
    });
  });
}

test.describe("character Import at normal size on the desktop", () => {
  test.use({ viewport: DESKTOP.size });

  test("opens on its heading with no ring, and the heading's box stays clear of the close button", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await page.getByRole("button", { name: IMPORT_DOOR }).click();
    const dialog = page.getByRole("dialog", { name: IMPORT_DOOR });
    const heading = dialog.getByRole("heading", { name: IMPORT_DOOR });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS("outline-style", "none");
    const close = await dialog.getByRole("button", { name: "Close", exact: true }).boundingBox();
    const text = await heading.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().right;
    });
    expect(text).toBeLessThanOrEqual((close?.x ?? 0) + SUBPIXEL);
  });
});

for (const [viewport, scale] of QUALIFIED.importOpen) {
  test.describe(`character Import opened at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("opens on its heading, whole words only", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-topbar")).toBeVisible();
      await scaleRoot(page, scale.factor);
      const door = page.getByRole("button", { name: IMPORT_DOOR });
      const menu = page.locator(`${BAND_MENU_TRIGGER}, ${TRAIL_MENU_TRIGGER}`).first();
      await expect(door.or(menu).first()).toBeVisible();
      if (await door.isVisible()) {
        await door.click();
      } else {
        await menu.click();
        await page.getByRole("menuitem", { name: IMPORT_DOOR }).click();
      }
      const dialog = page.getByRole("dialog", { name: IMPORT_DOOR });
      const heading = dialog.getByRole("heading", { name: IMPORT_DOOR });
      await expect(heading).toBeInViewport({ ratio: 1 });
      expect((await heading.evaluate(splitWords)).split).toEqual([]);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.newChat) {
  test.describe(`New chat at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps its rows inside the dialog and its actions reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect(dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true })).toBeVisible();
      await expect.poll(() => findings(dialog)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

// Every width the footer has to hold at. The short cells stand at 24rem of height or less, tall cells above it, and the
// normal-size cells prove the short step never fires for an unscaled reader.
const NARROW_300 = { name: "320 phone", touch: true, size: { width: 320, height: 568 } } as const;
const PHONE_360 = { name: "360 phone", touch: true, size: { width: 360, height: 800 } } as const;
const PHONE_430 = { name: "430 phone", touch: true, size: { width: 430, height: 932 } } as const;
const PHONE_375 = { name: "375 phone", touch: true, size: { width: 375, height: 667 } } as const;
const TEXT_250 = { name: "250% text", factor: 2.5 } as const;
const SHORT_CELLS = [
  [NARROW_300, TEXT_200],
  [PHONE_375, TEXT_200],
  [PHONE, TEXT_250],
  [PHONE_360, LAYOUT_300],
  [PHONE, LAYOUT_300],
  [PHONE_430, LAYOUT_300],
  [DESKTOP, LAYOUT_300],
] as const;
const TALL_CELLS = [
  [PHONE_360, TEXT_200],
  [PHONE, TEXT_200],
  [PHONE_430, TEXT_200],
  [DESKTOP, TEXT_200],
  [NARROW_300, { name: "normal text", factor: 1 }],
  [PHONE, { name: "normal text", factor: 1 }],
  [DESKTOP, { name: "normal text", factor: 1 }],
] as const;

const WHOLE_CONTROL = 0.98;

/** Mounts New chat at a root scale, with the caret landed in the search box. */
async function openNewChat(mountNewChat: () => Promise<unknown>, page: Page, factor: number): Promise<Locator> {
  await seedShellState(page, { activeSection: "chats" });
  await mountNewChat();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await scaleRoot(page, factor);
  await expect(dialog.getByRole("option").first()).toBeVisible();
  return dialog;
}

/** The dialog's footer action that begins a room, whichever label its step wears. */
const newChatMount = (mount: PlaywrightTestArgs["mount"]) => (): Promise<unknown> =>
  mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });

const startAction = (dialog: Locator): Locator => dialog.locator('[data-slot="new-chat-actions"] button').last();

async function expectPressable(control: Locator): Promise<void> {
  // An input's box sits a fraction of a pixel off its wrapper's, so a whole control reads just under 1.
  await expect(control).toBeInViewport({ ratio: WHOLE_CONTROL });
  await expect.poll(() => control.evaluate(coverOf)).toBeNull();
}

/** A short dialog's list stays a scroller, so the tail still loads by scroll, and is shorter than the body around it, so a
 *  swipe that ends on the list hands off to the body. The action row pins with Blank chat and Start unless the dialog's height cannot hold
 *  both over a whole row (`dialog-stacked-cramped` in primitives.css), where the row flows after the list and Blank chat sits below it. */
async function expectFooterStep(dialog: Locator, short: boolean, pinned: boolean): Promise<void> {
  const footer = dialog.locator('[data-slot="new-chat-actions"]');
  await expect(footer).toHaveCSS("position", pinned ? "sticky" : "static");
  await expect(footer).toBeInViewport({ ratio: 1 });
  await expect(footer.getByRole("button", { name: BLANK_CHAT_NAME, exact: true })).toHaveCount(pinned ? 1 : 0);
  const geometry = await dialog.locator('[data-slot="command-list"]').evaluate((list) => {
    let body = list.parentElement;
    while (body !== null && !/auto|scroll/u.test(getComputedStyle(body).overflowY)) {
      body = body.parentElement;
    }
    return {
      fits: list.clientHeight < (body?.clientHeight ?? 0) / 2,
      scrolls: list.scrollHeight > list.clientHeight,
      chain: getComputedStyle(list).overscrollBehaviorY,
    };
  });
  expect(geometry.chain).toBe(short ? "auto" : "contain");
  expect({ fits: geometry.fits || !short, scrolls: geometry.scrolls || !short }).toEqual({ fits: true, scrolls: true });
}

// One mount per named cell: the rate limit is a window, and the grid below carries the geometry at no request cost.
for (const [viewport, scale, short] of [...SHORT_CELLS.map((cell) => [...cell, true] as const), ...TALL_CELLS.map((cell) => [...cell, false] as const)]) {
  test.describe(`New chat's list and Start at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("holds its footer step, the focused search and Start after a deep pick by real keys, then Tab reaches Blank chat", async ({ mount, page }) => {
      const dialog = await openNewChat(newChatMount(mount), page, scale.factor);
      // The 360 phone is 15.9rem of dialog at 300%, under the 16.75rem step where a narrow pinned row seats both buttons over a whole row.
      await expectFooterStep(dialog, short, !(viewport === PHONE_360 && scale === LAYOUT_300));
      const search = dialog.getByRole("combobox");
      await expect(search).toBeFocused();
      await expectPressable(search);
      await expect(startAction(dialog)).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await expectPressable(search);
      const start = startAction(dialog);
      await expect(start).toBeEnabled();
      await expectPressable(start);
      await page.keyboard.type("a");
      await expect(search).toHaveValue("a");
      await expectPressable(search);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      await expect.poll(() => findings(dialog)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
      const blank = dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
      await expect(async () => {
        await page.keyboard.press("Tab");
        await expect(blank).toBeFocused({ timeout: DOOR_TIMEOUT_MS });
      }).toPass();
      await expectPressable(blank);
    });
  });
}

const GRID_WIDTHS = [320, 360, 375, 390, 430, 844];
const GRID_HEIGHTS = [568, 667, 844, 932, 390, 900];
const GRID_SCALES = [1, 1.25, 1.5, 2, 2.5, 3];

/**
 * Whether a row, Start and Blank chat can each be read and pressed whole at some scroll: every scroller around the list
 * is walked in small strides, and each point of the control is hit tested, so a pinned footer over it counts.
 */
function reachInDialog(popup: Element, { stride }: { readonly stride: number }): readonly string[] {
  const list = popup.querySelector('[data-slot="command-list"]');
  const row = popup.querySelector('[role="option"]');
  const actions = popup.querySelector('[data-slot="new-chat-actions"]');
  const start = actions?.querySelector("button:last-of-type");
  const blank = [...popup.querySelectorAll("button")].find((button) => button.textContent.includes("Blank") && button.checkVisibility());
  if (list === null || row === null || start === null || start === undefined || blank === undefined) {
    return ["the dialog has no list, row, Start or Blank chat"];
  }
  const scrollers: Element[] = [];
  for (let up = list.parentElement; up !== null && up !== popup.parentElement; up = up.parentElement) {
    if (/auto|scroll/u.test(getComputedStyle(up).overflowY) && up.scrollHeight > up.clientHeight) {
      scrollers.push(up);
    }
  }
  const whole = (control: Element): boolean => {
    const box = control.getBoundingClientRect();
    const inert = getComputedStyle(control).pointerEvents === "none";
    return [box.top + 2, box.top + box.height / 2, box.bottom - 2].every((y) => {
      const hit = document.elementFromPoint(box.left + box.width / 2, y);
      return hit !== null && (control.contains(hit) || (inert && hit === control.parentElement));
    });
  };
  const seen = new Set<Element>();
  const look = (): void => {
    for (const control of [row, start, blank]) {
      if (whole(control)) {
        seen.add(control);
      }
    }
  };
  const walk = (index: number): void => {
    const scroller = scrollers[index];
    if (scroller === undefined) {
      look();
      return;
    }
    const reach = scroller.scrollHeight - scroller.clientHeight;
    for (let at = 0; at < reach + stride; at += stride) {
      scroller.scrollTop = at;
      walk(index + 1);
    }
    scroller.scrollTop = 0;
  };
  for (const inner of [0, row instanceof HTMLElement ? row.offsetTop : 0]) {
    list.scrollTop = inner;
    walk(0);
  }
  list.scrollTop = 0;
  return [...(seen.has(row) ? [] : ["row"]), ...(seen.has(start) ? [] : ["Start"]), ...(seen.has(blank) ? [] : ["Blank chat"])];
}

/** Walks one mounted dialog across the grid, resizing in place: geometry only, so a cell costs a layout and no request. */
async function walkGrid(page: Page, dialog: Locator, widths: readonly number[]): Promise<{ readonly cells: number; readonly failures: readonly string[] }> {
  const failures: string[] = [];
  let cells = 0;
  for (const width of widths) {
    for (const height of GRID_HEIGHTS) {
      await page.setViewportSize({ width, height });
      for (const factor of GRID_SCALES) {
        await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
        await expect(dialog.getByRole("option").first()).toBeAttached();
        cells += 1;
        const missing = await dialog.evaluate(reachInDialog, { stride: GRID_STRIDE_PX });
        const clipped = await dialog.evaluate(cutOffControls, SUBPIXEL);
        failures.push(...[...missing, ...clipped].map((what) => `${String(width)}x${String(height)} at ${String(factor * 100)}%: ${what}`));
      }
    }
  }
  return { cells, failures };
}

/** Controls or text painted past the dialog's sides: a stack that overflows there reads as a clipped sentence. */
function cutOffControls(popup: Element, subpixel: number): string[] {
  const frame = popup.getBoundingClientRect();
  return [...popup.querySelectorAll("button, p, span")]
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > subpixel && element.checkVisibility() && (box.left < frame.left - subpixel || box.right > frame.right + subpixel);
    })
    .map((element) => `"${element.textContent.trim().slice(0, 30)}" leaves the dialog`);
}

// Under the slack of a control that barely fits its window, so the walk cannot step over the one position that shows it.
const GRID_STRIDE_PX = 24;
const GRID_TIMEOUT_MS = 180_000;

for (const pointer of ["touch", "fine"] as const) {
  test.describe(`New chat's reach over the size grid, ${pointer} pointer`, () => {
    test.use(pointer === "touch" ? { viewport: PHONE.size, hasTouch: true, isMobile: true } : { viewport: DESKTOP.size });
    const widths = pointer === "touch" ? GRID_WIDTHS : [DESKTOP.size.width];

    test("shows a whole row, Start and Blank chat at every size", async ({ mount, page }) => {
      test.setTimeout(GRID_TIMEOUT_MS);
      const dialog = await openNewChat(newChatMount(mount), page, 1);
      expect(await walkGrid(page, dialog, widths)).toEqual({ cells: widths.length * GRID_HEIGHTS.length * GRID_SCALES.length, failures: [] });
    });

    test("holds with the temporary-room notice above the list", async ({ mount, page }) => {
      test.setTimeout(GRID_TIMEOUT_MS);
      const dialog = await openNewChat(() => mount<typeof AppShellTemporaryNewChatStory>(`${SHELL_STORIES}/AppShellTemporaryNewChatStory`, {}), page, 1);
      expect(await walkGrid(page, dialog, widths)).toEqual({ cells: widths.length * GRID_HEIGHTS.length * GRID_SCALES.length, failures: [] });
    });
  });
}

/** The vertical gaps between consecutive printed rows, in document order: an overlap or a hole is a lost row. */
function printedRowTops(list: Element): { readonly tops: readonly number[]; readonly ink: readonly string[] } {
  const rows = [...list.querySelectorAll('[data-slot="message-list-row"]')];
  return {
    tops: rows.map((row) => row.getBoundingClientRect().top),
    ink: rows.slice(0, 1).map((row) => getComputedStyle(row.querySelector('[data-slot="message-bubble"]') ?? row).color),
  };
}

// The document and body backgrounds a printed page lands on: white paper, whatever the screen theme.
const PAPER_GROUND = ["rgb(255, 255, 255)", "rgb(255, 255, 255)"];

/** The ground the page paints behind its rows: the document's and the body's backgrounds. */
function documentGround(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => [document.documentElement, document.body].map((node) => getComputedStyle(node).backgroundColor));
}

// virtual-core's default `isScrollingResetDelay`: until this long after the last scroll event the list counts as
// scrolling and does not measure a row as it mounts, so a reader who printed sooner than this would not reach the defect.
const VIRTUAL_CORE_SCROLLING_RESET_MS = 150;

test.describe("printing a room", () => {
  test.use({ viewport: DESKTOP.size });

  // `page.pdf` is the one real print a test can drive: the events alone lay out no paper, so nothing moves.
  test("leaves a scrolled-up reader on the row they were reading", async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "Only Chromium prints to PDF");
    const pagedRoomId = await findPagedRoom();
    await openRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page, pagedRoomId);
    const list = page.locator('[data-slot="message-list-scroll"]');
    const rows = page.locator('[data-slot="message-list-row"]');
    await expect(page.locator('[data-slot="message-bubble"]').last()).toBeVisible();
    const topRow = (): Promise<{ readonly index: string | null; readonly offset: number }> =>
      list.evaluate((node) => {
        const top = node.getBoundingClientRect().top;
        const row = [...node.querySelectorAll('[data-slot="message-list-row"]')].find((candidate) => candidate.getBoundingClientRect().bottom > top);
        return { index: row?.getAttribute("data-index") ?? null, offset: Math.round((row?.getBoundingClientRect().top ?? 0) - top) };
      });
    // The reader comes to rest: this listener is added after the virtualizer's, so each scroll event re-arms its
    // timer after the virtualizer's own, and the quiet period ends after the list stops counting as scrolling.
    await absenceWindow(page, VIRTUAL_CORE_SCROLLING_RESET_MS, { scroller: list, byPx: -2000 });
    await expect.poll(() => list.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeGreaterThan(500);
    await expect.poll(topRow).toEqual(await topRow());
    const reading = await topRow();
    const windowed = await rows.count();
    await page.pdf();
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(windowed);
    // Settled: the first ResizeObserver delivery after the print is the frame the virtualizer's own observer
    // re-measures in, and the frame after it applies that measure.
    await list.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          const observer = new ResizeObserver(() => {
            observer.disconnect();
            requestAnimationFrame(() => resolve());
          });
          for (const row of node.querySelectorAll('[data-slot="message-list-row"]')) {
            observer.observe(row);
          }
        }),
    );
    expect(await topRow()).toEqual(reading);
  });

  test("flows every loaded message down the page on paper-coloured ground, says what it leaves out, and windows again after", async ({ mount, page }) => {
    const pagedRoomId = await findPagedRoom();
    await openRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page, pagedRoomId);
    const list = page.locator('[data-slot="message-list-scroll"]');
    await expect(page.locator('[data-slot="message-bubble"]').last()).toBeVisible();
    const windowed = await page.locator('[data-slot="message-list-row"]').count();
    const caller = await root.internalCallerFor(root.ownerId);
    const { messages, previousCursor } = await caller.chat.listMessages({ chatId: pagedRoomId });
    expect(windowed).toBeLessThan(messages.length);
    expect(previousCursor).not.toBeNull();

    // Read a microtask after the event: a real print lays out before any frame, so rows that a later observer mounts
    // under the emulated media never reach paper.
    const mountedForPaper = await page.evaluate(async () => {
      dispatchEvent(new Event("beforeprint"));
      await Promise.resolve();
      return document.querySelectorAll('[data-slot="message-list-row"]').length;
    });
    expect(mountedForPaper).toBe(messages.length);
    // A print dialog shows the screen behind it, so the rows mounted for paper must sit in order there, not in a pile.
    const behindDialog = await list.evaluate(printedRowTops);
    expect(behindDialog.tops).toEqual(behindDialog.tops.toSorted((a, b) => a - b));
    expect(new Set(behindDialog.tops).size).toBe(behindDialog.tops.length);
    const screenGround = await documentGround(page);
    await page.emulateMedia({ media: "print", reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none", contrast: "no-preference" });
    // A dark theme's ground does not print: the page lands on white paper, with the black ink read below.
    expect(await documentGround(page)).toEqual(PAPER_GROUND);
    expect(screenGround).not.toEqual(PAPER_GROUND);
    const paper = await list.evaluate((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, sheet: innerWidth }));
    expect(paper.left).toBeLessThanOrEqual(SUBPIXEL);
    expect(paper.right).toBeLessThanOrEqual(paper.sheet + SUBPIXEL);
    await expect(page.locator(".shell-panel-edge").first()).toBeHidden();
    const { tops, ink } = await list.evaluate(printedRowTops);
    // Page one starts with the room, not with the blank height of rows that were never mounted.
    expect(tops[0]).toBeLessThan(DESKTOP.size.height / 2);
    expect(tops).toEqual(tops.toSorted((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
    expect(ink).toEqual(["rgb(0, 0, 0)"]);
    await expect(page.getByText(CHAT_PRINT_COVERAGE, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true })).toBeHidden();
    await expect(page.locator(".shell-topbar")).toBeHidden();
    await expect(page.locator('[data-slot="composer"]')).toBeHidden();
    const scrollers = await list.evaluate((node) => {
      const stuck: string[] = [];
      for (let up: Element | null = node; up !== null; up = up.parentElement) {
        const { overflowY, maskImage } = getComputedStyle(up);
        if (/auto|scroll|hidden/u.test(overflowY) || maskImage !== "none") {
          stuck.push(up.getAttribute("data-slot") ?? up.tagName);
        }
      }
      return stuck;
    });
    expect(scrollers).toEqual([]);

    await page.evaluate(() => dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none", contrast: "no-preference" });
    await expect.poll(() => page.locator('[data-slot="message-list-row"]').count()).toBeLessThan(messages.length);
    await expect(page.getByText(CHAT_PRINT_COVERAGE, { exact: true })).toBeHidden();
  });
});

for (const [viewport, scale] of QUALIFIED.listPanel) {
  test.describe(`list panel at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every control reachable and uncovered", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-panel[data-panel-side='list']")).toHaveAttribute("data-panel-mode", "docked");
      await scaleRoot(page, scale.factor);
      await expect.poll(() => findings(page.locator(".shell-grid"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
      // The list is the band's reason to exist: a character row must be on screen, not only the band's controls.
      const row = page.locator(".shell-panel[data-panel-side='list']").getByRole("listitem").first();
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeInViewport();
    });
  });
}

for (const [viewport, scale] of QUALIFIED.topbarMenu) {
  test.describe(`topbar menu at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("stays on screen with every item reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await scaleRoot(page, scale.factor);
      await page.locator(TRAIL_MENU_TRIGGER).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect
        .poll(async () => {
          const box = await menu.boundingBox();
          return box !== null && box.x >= -SUBPIXEL && box.x + box.width <= viewport.size.width + SUBPIXEL;
        })
        .toBe(true);
      await expect.poll(() => findings(menu)).toEqual([]);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.youSheet) {
  test.describe(`You sheet at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every entry reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await scaleRoot(page, scale.factor);
      await page.locator('.shell-rail [data-modal-trigger="you"]').click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect.poll(() => findings(sheet)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.roomHeader) {
  test.describe(`room header at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every header control reachable and the overflow trigger in the row", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await scaleRoot(page, scale.factor);
      await expect.poll(() => findings(page.locator(".shell-topbar"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.room) {
  test.describe(`room at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the transcript, the message field and Send reachable", async ({ mount, page }) => {
      const input = await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await scaleRoot(page, scale.factor);
      await expect(page.getByRole("button", { name: CHAT_SEND_NAME, exact: true })).toBeVisible();
      // The room scrolls once the composer and a readable transcript cannot share it, so both are reachable, not both on screen.
      for (const control of [input, page.getByRole("button", { name: CHAT_SEND_NAME, exact: true })]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport({ ratio: 1 });
      }
      await expect.poll(() => findings(page.locator(".shell-content"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
      // The composer never collapses the room: the transcript keeps a height to read in.
      // A room short at this scale floors the transcript; a taller one leaves it what the composer spares.
      const scrollFloor = `var(${TOKENS["height.scroll-sm"].cssVar})`;
      const floor = await resolvedBlockSize(page, scale === LAYOUT_300 ? scrollFloor : `calc(${scrollFloor} / 2)`);
      await expect.poll(() => page.locator('[data-slot="message-list-scroll"]').evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(floor - SUBPIXEL);
    });

    // Each action the row may hand over is in exactly one place: its row button, or the Reply group of the menu.
    test("keeps every secondary action in the row or in the Message tools menu, never both", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      // At the default scale every action sits in the row, so the names production gives them are read off the buttons.
      const nameOf = async (id: Parameters<typeof testId>[0]): Promise<string> => {
        const name = await page.getByTestId(testId(id)).getAttribute("aria-label");
        if (name === null) {
          throw new Error(`The composer's ${id} control carries no accessible name`);
        }
        return name;
      };
      const rowActions = await Promise.all([nameOf("composerGuidedSwipe"), nameOf("composerGuidedContinue"), nameOf("composerGuidedImpersonate")]);
      const generateName = await nameOf("composerGuidedResponse");
      const menuName = await nameOf("composerUtility");
      await scaleRoot(page, scale.factor);
      const movedActions = async (): Promise<string[]> =>
        (await Promise.all(rowActions.map(async (name) => ((await page.getByRole("button", { name, exact: true }).count()) > 0 ? [] : [name])))).flat();
      // The overflow order: Try another reply, Continue the reply, then Draft your line; the count is what the room measures.
      const moved = rowActions.slice(0, COMPOSER_MOVED_COUNT[`${viewport.name} ${scale.name}`]);
      await expect.poll(movedActions).toEqual(moved);
      await expect(page.getByRole("button", { name: generateName, exact: true })).toBeVisible();
      await page.getByRole("button", { name: menuName, exact: true }).click();
      const menu = page.getByRole("menu");
      for (const name of rowActions) {
        await expect(menu.getByRole("menuitem", { name })).toHaveCount(moved.includes(name) ? 1 : 0);
      }
      await expect(menu.getByRole("menuitem", { name: generateName })).toHaveCount(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.jumpToLatest) {
  test.describe(`Jump to latest at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    // The pill is mounted while hidden and takes its width from the same label it shows, so its box is the one a
    // pending arrival would paint; the flank row clips on x, so a pill wider than the row loses its ends.
    test("stays inside the flank row it overlays", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await scaleRoot(page, scale.factor);
      const row = page.locator('[data-slot="chat-room-flank-row"]');
      const pill = page.locator('[data-slot="jump-to-latest"] button');
      await expect
        .poll(async () => {
          const [within, button] = await Promise.all([row.boundingBox(), pill.boundingBox()]);
          return within !== null && button !== null && button.x >= within.x - SUBPIXEL && button.x + button.width <= within.x + within.width + SUBPIXEL;
        })
        .toBe(true);
    });
  });
}

/** The painted text extent of every tab-bar label that is displayed, left to right, with its own tab's box. */
function tabLabelExtents(bar: Element): { readonly name: string; readonly text: DOMRect; readonly tab: DOMRect }[] {
  return [...bar.querySelectorAll(".shell-rail-button")]
    .filter((tab) => tab.checkVisibility({ visibilityProperty: true }))
    .flatMap((tab) => {
      const label = tab.querySelector(".shell-rail-button-label");
      if (label === null || getComputedStyle(label).display === "none") {
        return [];
      }
      const range = document.createRange();
      range.selectNodeContents(label);
      return [{ name: tab.getAttribute("aria-label") ?? "", text: range.getBoundingClientRect(), tab: tab.getBoundingClientRect() }];
    })
    .toSorted((a, b) => a.tab.left - b.tab.left);
}

for (const [viewport, scale] of QUALIFIED.phoneTabs) {
  test.describe(`phone tab bar at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("shows each label whole inside its own tab or none of them, and keeps every tab named and reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      const bar = page.locator(".shell-rail");
      await expect(bar).toBeVisible();
      await scaleRoot(page, scale.factor);
      for (const tab of await bar.locator(".shell-rail-button:visible").all()) {
        await expect(tab).not.toHaveAccessibleName("");
      }
      await expect
        .poll(async () => {
          const labels = await bar.evaluate(tabLabelExtents);
          return labels.every(
            (label, index) =>
              label.text.left >= label.tab.left - SUBPIXEL &&
              label.text.right <= label.tab.right + SUBPIXEL &&
              (index === 0 || (labels[index - 1]?.text.right ?? 0) <= label.text.left + SUBPIXEL),
          );
        })
        .toBe(true);
      await expect.poll(() => findings(bar)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.presetsWelcome) {
  test.describe(`Presets welcome at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("stays inside the content pane and leaves the topbar reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "presets" });
      await mount<typeof AppShellStory>(STORY, {});
      if (viewport.touch) {
        // A phone lands on the roster; the topbar door swaps it for the section's no-selection content.
        await page.getByRole("button", { name: /^Show .+ overview$/u }).click();
      }
      const pane = page.locator(".shell-content");
      const welcome = pane.locator('[data-slot="empty-state-root"]');
      await expect(welcome).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect
        .poll(async () => {
          const [within, box] = await Promise.all([pane.boundingBox(), welcome.boundingBox()]);
          return within !== null && box !== null && box.y >= within.y - SUBPIXEL;
        })
        .toBe(true);
      // A topbar control holds focus here, and its open tooltip is a transient popup, not part of the layout under test.
      await page.keyboard.press("Escape");
      await expect.poll(() => findings(page.locator(".shell-grid"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

// A section's no-selection welcome whose EmptyState offers a Button. The action wraps without a prop at the call site.
const EMPTY_STATE_ACTION_SURFACES = [
  { surface: "Chats landing", section: "chats" },
  { surface: "Extensions page picker", section: "extensions" },
] as const;

for (const [viewport, scale] of QUALIFIED.emptyStateActions) {
  for (const { surface, section } of EMPTY_STATE_ACTION_SURFACES) {
    test.describe(`${surface} action at ${scale.name} on the ${viewport.name}`, () => {
      test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

      test("stays inside the content pane", async ({ mount, page }) => {
        await seedShellState(page, { activeSection: section });
        await mount<typeof AppShellStory>(STORY, {});
        // A phone lands on the roster; the topbar door swaps it for the section's no-selection content.
        await page.getByRole("button", { name: /^Show .+ overview$/u }).click();
        const pane = page.locator(".shell-content");
        const action = pane.locator('[data-slot="empty-state-action"] [data-slot="button"]');
        await expect(action).toBeVisible();
        await scaleRoot(page, scale.factor);
        await expect
          .poll(async () => {
            const [within, box] = await Promise.all([pane.boundingBox(), action.boundingBox()]);
            return within !== null && box !== null && box.x >= within.x - SUBPIXEL && box.x + box.width <= within.x + within.width + SUBPIXEL;
          })
          .toBe(true);
        // A label breaks between its words: a word is never cut to fit a pane that has room for it whole.
        expect((await action.evaluate(splitWords)).split).toEqual([]);
        // The welcome alone: the narrow phone's topbar at 300% is a separate, qualified-out cell of this suite.
        await expect.poll(() => findings(pane.locator('[data-slot="empty-state-root"]'))).toEqual([]);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
      });
    });
  }
}

for (const [viewport, scale] of QUALIFIED.importDialog) {
  test.describe(`character Import dialog at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("fits its frame and keeps both exits reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await page.getByRole("button", { name: IMPORT_DOOR }).click();
      const dialog = page.getByRole("dialog", { name: IMPORT_DOOR });
      await expect(dialog).toBeVisible();
      await scaleRoot(page, scale.factor);
      // The popup is its own scroller on a short viewport, so an exit is reachable once scrolled to.
      for (const name of ["Cancel", "Close"]) {
        const exit = dialog.getByRole("button", { name, exact: true });
        await exit.scrollIntoViewIfNeeded();
        await expect(exit).toBeInViewport({ ratio: 1 });
      }
      const frame = await dialog.boundingBox();
      expect(frame?.x ?? -1).toBeGreaterThanOrEqual(-SUBPIXEL);
      expect((frame?.x ?? 0) + (frame?.width ?? 0)).toBeLessThanOrEqual(viewport.size.width + SUBPIXEL);
      await expect.poll(() => findings(dialog)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.characterEditor) {
  test.describe(`character editor at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the save bar's parts apart and the editor's controls inside its column", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: await firstCharacterId() });
      const editor = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true });
      await expect(editor).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect.poll(() => editor.locator('[data-slot="save-bar-root"]').evaluate(overlappingParts, SUBPIXEL)).toEqual([]);
      await expect.poll(() => findings(editor)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.saveBarName) {
  test.describe(`character editor save bar at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("shows the whole name beside its kind inside the bar", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: await firstCharacterId() });
      const bar = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true }).locator('[data-slot="save-bar-root"]');
      await expect(bar).toBeVisible();
      await scaleRoot(page, scale.factor);
      const title = bar.locator('[data-slot="save-bar-title"]');
      await expect.poll(() => title.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(SUBPIXEL);
      await expect.poll(async () => (await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
      await expect.poll(() => bar.evaluate(overlappingParts, SUBPIXEL)).toEqual([]);
      await expect
        .poll(async () => {
          const [within, kind] = await Promise.all([bar.boundingBox(), bar.locator('[data-slot="save-bar-kind"]').boundingBox()]);
          return within !== null && kind !== null && kind.x >= within.x - SUBPIXEL && kind.x + kind.width <= within.x + within.width + SUBPIXEL;
        })
        .toBe(true);
    });
  });
}

test.describe("character editor at normal text on a 320px phone", () => {
  test.use({ viewport: NARROW.size, hasTouch: true, isMobile: true });

  test("keeps the save bar's name and status on one line", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: await firstCharacterId() });
    const bar = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true }).locator('[data-slot="save-bar-root"]');
    await expect(bar).toBeVisible();
    await expect
      .poll(async () => {
        const [label, actions] = await Promise.all([
          bar.locator('[data-slot="save-bar-label"]').boundingBox(),
          bar.locator('[data-slot="save-bar-actions"]').boundingBox(),
        ]);
        return label !== null && actions !== null && actions.y < label.y + label.height && label.y < actions.y + actions.height;
      })
      .toBe(true);
  });
});

for (const [viewport, scale] of QUALIFIED.echoFoot) {
  test.describe(`Echo's foot band at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("stays inside its card with its chevrons reachable", async ({ mount, page }) => {
      const resting = appearanceSettingsSchema.parse({}).chatStyle;
      await setChatStyle("echo");
      try {
        await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
        await scaleRoot(page, scale.factor);
        await page.locator('[data-slot="message-list-scroll"]').evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        const foot = page.locator('[data-slot="swipe-strip"]');
        await foot.scrollIntoViewIfNeeded();
        const card = page.locator('[data-slot="message-bubble"]').last();
        await expect
          .poll(async () => {
            const [within, band] = await Promise.all([card.boundingBox(), foot.boundingBox()]);
            return within !== null && band !== null && band.x >= within.x - SUBPIXEL && band.x + band.width <= within.x + within.width + SUBPIXEL;
          })
          .toBe(true);
        await expect.poll(() => findings(foot)).toEqual([]);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await setChatStyle(resting);
      }
    });
  });
}

for (const [viewport, scale] of QUALIFIED.renameField) {
  test.describe(`renaming a room at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the typed name inside the title group, whatever its length", async ({ mount, page }) => {
      await openLongRoom((chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }), page);
      await scaleRoot(page, scale.factor);
      await page.locator("button.shell-topbar-title-group").click();
      const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
      await field.fill("A name long enough to run past the room the topbar leaves its title group at an enlarged root");
      const group = page.locator(".shell-topbar-title-group").filter({ has: field });
      await expect
        .poll(async () => {
          const [within, box] = await Promise.all([group.boundingBox(), field.boundingBox()]);
          return within !== null && box !== null && box.x >= within.x - SUBPIXEL && box.x + box.width <= within.x + within.width + SUBPIXEL;
        })
        .toBe(true);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

test("the probe fails a clipped control, a column that scrolls sideways and an overlapping pair, and passes a control its own strip reaches", async ({
  mount,
  page,
}) => {
  await mount<typeof PlantedControlsStory>(`${PROBE_STORIES}/PlantedControlsStory`, {});
  const clipped = await findings(page.locator('[data-planted="clipped"]'));
  expect(clipped).toHaveLength(1);
  expect(clipped[0]).toContain("clipped on x");
  expect(await findings(page.locator('[data-planted="scrolled"]'))).toEqual([]);
  expect(await findings(page.locator('[data-planted="sideways"]'))).toEqual([expect.stringContaining("scrolls sideways")]);
  // The same overflow, declared by the strip's own variant, is a designed strip and not a finding.
  expect(await page.locator('[data-planted="declared"]').evaluate((strip) => strip.scrollWidth - strip.clientWidth)).toBeGreaterThan(SUBPIXEL);
  expect(await findings(page.locator('[data-planted="declared"]'))).toEqual([]);
  expect(await findings(page.locator('[data-planted="stacked"]'))).toContainEqual(expect.stringContaining("overlaps"));
});

test("the probe passes a control an open toast lies over and fails one a plain box covers", async ({ mount, page }) => {
  await mount<typeof PlantedCoverStory>(`${PROBE_STORIES}/PlantedCoverStory`, {});
  const notice = page.locator('[data-slot="toast-root"]').first();
  await expect(notice).toBeVisible();
  const control = page.locator('[data-planted="under-toast"]');
  // The notice really lies over the control: a press on it lands on the toast.
  await expect
    .poll(async () =>
      control.evaluate((button) =>
        document
          .elementsFromPoint(
            button.getBoundingClientRect().x + button.getBoundingClientRect().width / 2,
            button.getBoundingClientRect().y + button.getBoundingClientRect().height / 2,
          )
          .some((hit) => hit.closest('[data-slot="toast-root"]') !== null),
      ),
    )
    .toBe(true);
  expect(await findings(page.locator("body"))).not.toContainEqual(expect.stringContaining("Under the notice"));
  expect(await findings(page.locator("body"))).toContainEqual(expect.stringContaining("Under the box"));
});
