// The topbar, the room and the character Import dialog on the production shell at enlarged text: 200% (WCAG 1.4.4 text
// resize) and 300% layout, at the phone and desktop viewports, on Chromium and the opt-in WebKit project. The appearance
// setting is bounded by `FONT_SCALE`, so these scales are the root multiplier the writer carries; `:root { font-size }` multiplies it the
// same way, but a `rem` inside a media query stays at the platform default, so a browser whose own default is 200% would
// also flip the shell regime. Every surface runs every cell of EVERY_CELL; an exception is named beside it in QUALIFIED.

import { BLANK_CHAT_NAME, contextToggleLabel, testId } from "@orb/client/lib";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, emulateSoftKeyboard, ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_EDITOR_NAME } from "#client/features/character/lib/character-names.ts";
import type { AppShellCharacterStory, AppShellModalStory, AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { PlantedControlsStory } from "./_text-scale-probe-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const PROBE_STORIES = "tests/client/features/app-shell/surfaces/_text-scale-probe-stories";
const PHONE = { name: "phone", touch: true, size: { width: 390, height: 844 } } as const;
const NARROW = { name: "narrow phone", touch: true, size: { width: 320, height: 568 } } as const;
const DESKTOP = { name: "desktop", touch: false, size: { width: 1440, height: 900 } } as const;
const TEXT_200 = { name: "200% text", factor: 2 } as const;
const LAYOUT_300 = { name: "300% layout", factor: 3 } as const;
// The character band's chip row scrolls by ruling: it keeps each chip whole rather than wrap into a ragged void.
const SIDEWAYS_STRIPS = 'input, textarea, [role="tablist"], [role="toolbar"], [data-slot="character-context-band"] > * > *';
const IMPORT_DOOR = /^Import/u;
const BAND_MENU_TRIGGER = '[data-slot="list-pane-action"] [data-slot="overflow-actions-trigger"]';
const TRAIL_MENU_TRIGGER = '.shell-topbar-trail [data-slot="overflow-actions-trigger"]';
const FONT_SCALE_PROPERTY = channelName("fontScale");
// Layout rounding can read a box a fraction past its container with nothing clipped; a one-pixel box is a screen-reader span.
const SUBPIXEL = 1;
const DOOR_TIMEOUT_MS = 2000;
const REACHABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"]';

type Viewport = typeof PHONE | typeof NARROW | typeof DESKTOP;
type Scale = typeof TEXT_200 | typeof LAYOUT_300;
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
// A keyboard that leaves the phone about 500px: the room's field must stay above it.
const PHONE_KEYBOARD = 340;

const QUALIFIED = {
  readingWindow: EVERY_CELL,
  topbar: [...EVERY_CELL, NARROW_CELL],
  contextHeader: EVERY_CELL,
  roomContext: [...EVERY_CELL, NARROW_CELL],
  gameRoomMembers: EVERY_CELL,
  focusedField: EVERY_CELL,
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
  importDialog: EVERY_CELL,
  characterEditor: EVERY_CELL,
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

/**
 * Reachable controls that a user could not press: painted past the viewport or past a clipping ancestor on either axis (a scroller
 * keeps its children reachable on its own axis), or covered at their centre by something that is not the control.
 */
function clippedControls(subject: Element, { reachable, subpixel }: { readonly reachable: string; readonly subpixel: number }): string[] {
  const label = (element: Element): string =>
    `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40)}"`;
  const spans = (
    box: DOMRect,
    bounds: DOMRect | { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  ): string[] => [
    ...(box.left < bounds.left - subpixel || box.right > bounds.right + subpixel ? ["x"] : []),
    ...(box.top < bounds.top - subpixel || box.bottom > bounds.bottom + subpixel ? ["y"] : []),
  ];
  const ancestorsOf = (element: Element): Element[] => {
    const chain: Element[] = [];
    for (let up = element.parentElement; up !== null && up !== document.documentElement; up = up.parentElement) {
      chain.push(up);
    }
    return chain;
  };
  const kindOf = (overflow: string): "scroll" | "clip" | "free" => {
    if (overflow === "auto" || overflow === "scroll") {
      return "scroll";
    }
    return overflow === "hidden" || overflow === "clip" ? "clip" : "free";
  };
  const clipAxis = (element: Element, box: DOMRect): string | null => {
    // Inner to outer: each ancestor the control sticks out of, on which axis, and what that ancestor does with the excess.
    const events = ancestorsOf(element).flatMap((ancestor) => {
      const style = getComputedStyle(ancestor);
      return spans(box, ancestor.getBoundingClientRect()).map((axis) => ({ axis, ancestor, kind: kindOf(axis === "x" ? style.overflowX : style.overflowY) }));
    });
    // Content before a scroller's start edge has no scroll position that reaches it.
    const beforeStart = ancestorsOf(element)
      .filter((ancestor) => kindOf(getComputedStyle(ancestor).overflowX) !== "free")
      .slice(0, 1)
      .find((ancestor) => box.left < ancestor.getBoundingClientRect().left - ancestor.scrollLeft - subpixel);
    if (beforeStart !== undefined) {
      return `past the start of ${label(beforeStart)}`;
    }
    const scrolls = (axis: string, before: number): boolean => events.slice(0, before).some((event) => event.axis === axis && event.kind === "scroll");
    const cut = events.find((event, index) => event.kind === "clip" && !scrolls(event.axis, index));
    if (cut !== undefined) {
      return `clipped on ${cut.axis} by ${label(cut.ancestor)}`;
    }
    const past = spans(box, { left: 0, right: innerWidth, top: 0, bottom: innerHeight }).filter((axis) => !scrolls(axis, events.length));
    return past.length === 0 ? null : `past the viewport edge on ${past.join("")}`;
  };
  const Disabled = '[aria-disabled="true"], :disabled, [data-disabled]';
  const coveredBy = (element: Element, box: DOMRect): Element | null => {
    if (element.matches(Disabled)) {
      return null;
    }
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const top = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : element;
    return top !== null && element.contains(top) ? null : top;
  };
  const verdict = (element: Element): string | null => {
    const box = element.getBoundingClientRect();
    const at = `[${String(Math.round(box.left))},${String(Math.round(box.top))} ${String(Math.round(box.width))}x${String(Math.round(box.height))}]`;
    const clipped = clipAxis(element, box);
    if (clipped !== null) {
      return `${label(element)} ${at} ${clipped}`;
    }
    // A control the user reaches by scrolling its own scroller is not covered by what sits where it would be unscrolled.
    const reachedByScrolling = ancestorsOf(element).some((ancestor) => {
      const style = getComputedStyle(ancestor);
      return spans(box, ancestor.getBoundingClientRect()).some((axis) => kindOf(axis === "x" ? style.overflowX : style.overflowY) === "scroll");
    });
    if (reachedByScrolling) {
      return null;
    }
    const cover = coveredBy(element, box);
    // A pinned footer lies over the rows scrolling under it by design.
    return cover === null || cover.closest('[class*="sticky"]') !== null
      ? null
      : `${label(element)} ${at} is covered at its centre by ${label(cover)} ${cover.className}`;
  };
  return [...subject.querySelectorAll(reachable)]
    .filter(
      (element) =>
        element.checkVisibility({ visibilityProperty: true }) &&
        element.closest("[inert]") === null &&
        // A disabled control takes no press, and its words still have to fit on screen.
        (getComputedStyle(element).pointerEvents !== "none" || element.matches(Disabled)) &&
        element.getBoundingClientRect().width > subpixel,
    )
    .map(verdict)
    .filter((found): found is string => found !== null);
}

/** Text cut with no ellipsis to say so: a single line past its box, or lines past a box that does not scroll. */
function cutOffText(subject: Element, { subpixel }: { readonly subpixel: number }): string[] {
  const paintsText = (element: Element): boolean =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  const cuts = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const clipsLine = style.overflowX === "hidden" || style.overflowX === "clip";
    const clipsLines = style.overflowY === "hidden" || style.overflowY === "clip";
    const cutInline = clipsLine && style.textOverflow !== "ellipsis" && style.whiteSpace === "nowrap" && element.scrollWidth > element.clientWidth + subpixel;
    return cutInline || (clipsLines && style.webkitLineClamp === "none" && element.scrollHeight > element.clientHeight + subpixel);
  };
  return [...subject.querySelectorAll("*")]
    .filter(
      (element) =>
        paintsText(element) && element.getBoundingClientRect().width > subpixel && element.checkVisibility({ visibilityProperty: true }) && cuts(element),
    )
    .map((element) => `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 40)}"`);
}

/** Pairs of controls overlapping inside one scroller: a centre hit test misses one that lies over a neighbour's edge. */
function overlappingControls(subject: Element, { reachable, subpixel }: { readonly reachable: string; readonly subpixel: number }): string[] {
  const name = (element: Element): string => (element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40);
  const scrollerOf = (element: Element): Element | null => {
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      if (/auto|scroll/u.test(getComputedStyle(up).overflowY)) {
        return up;
      }
    }
    return null;
  };
  const painted = [...subject.querySelectorAll(reachable)].filter(
    (element) =>
      element.checkVisibility({ visibilityProperty: true }) &&
      element.closest("[inert]") === null &&
      getComputedStyle(element).pointerEvents !== "none" &&
      // A dropzone's file input is a transparent sheet over its own zone, and it passes under a dialog's pinned footer.
      !element.matches('input[type="file"]') &&
      element.getBoundingClientRect().width > subpixel,
  );
  // A pinned footer lies over the rows scrolling under it by design.
  const pinned = (element: Element): boolean => {
    for (let up: Element | null = element; up !== null; up = up.parentElement) {
      if (getComputedStyle(up).position === "sticky") {
        return true;
      }
    }
    return false;
  };
  return painted.flatMap((element, index) =>
    painted.slice(index + 1).flatMap((other) => {
      const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
      const inline = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const block = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlap = inline > subpixel && block > subpixel && !element.contains(other) && !other.contains(element);
      return overlap && !pinned(element) && !pinned(other) && scrollerOf(element) === scrollerOf(other) ? [`"${name(element)}" overlaps "${name(other)}"`] : [];
    }),
  );
}

/** A column that scrolls sideways has stopped reflowing; a strip of tabs or chips is built to scroll that way. */
function sidewaysColumns(subject: Element, { strips, subpixel }: { readonly strips: string; readonly subpixel: number }): string[] {
  return [subject, ...subject.querySelectorAll("*")]
    .filter((element) => {
      const scrolls = /auto|scroll/u.test(getComputedStyle(element).overflowX);
      return (
        scrolls && !element.matches(strips) && element.checkVisibility({ visibilityProperty: true }) && element.scrollWidth > element.clientWidth + subpixel
      );
    })
    .map(
      (element) =>
        `${element.tagName.toLowerCase()} ${element.getAttribute("data-slot") ?? element.className} scrolls sideways by ${String(element.scrollWidth - element.clientWidth)}`,
    );
}

/** A scroller holding content in a box shorter than one line of it: touch cannot reach what it holds. */
function collapsedScrollers(subject: Element, { subpixel }: { readonly subpixel: number }): string[] {
  const line = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return [subject, ...subject.querySelectorAll("*")]
    .filter((element) => {
      const scrolls = /auto|scroll/u.test(getComputedStyle(element).overflowY);
      const painted = element.checkVisibility({ visibilityProperty: true }) && element.getBoundingClientRect().width > subpixel;
      return scrolls && painted && !element.matches("textarea") && element.clientHeight < line && element.scrollHeight > element.clientHeight + subpixel;
    })
    .map(
      (element) =>
        `${element.getAttribute("data-slot") ?? element.tagName.toLowerCase()} is ${String(element.clientHeight)} tall over ${String(element.scrollHeight)}`,
    );
}

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

async function findings(scope: Locator): Promise<string[]> {
  const controls = await scope.evaluate(clippedControls, { reachable: REACHABLE, subpixel: SUBPIXEL });
  const overlaps = await scope.evaluate(overlappingControls, { reachable: REACHABLE, subpixel: SUBPIXEL });
  const text = await scope.evaluate(cutOffText, { subpixel: SUBPIXEL });
  const columns = await scope.evaluate(sidewaysColumns, { strips: SIDEWAYS_STRIPS, subpixel: SUBPIXEL });
  const collapsed = await scope.evaluate(collapsedScrollers, { subpixel: SUBPIXEL });
  return [...controls, ...overlaps, ...text, ...columns, ...collapsed];
}

/** What takes a press at a control's centre instead of the control, or null when the control takes it. */
function coverOf(button: Element): string | null {
  const box = button.getBoundingClientRect();
  const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  // A disabled control takes no press itself, so its own row answering is the row leaving it uncovered.
  const inert = getComputedStyle(button).pointerEvents === "none" && top === button.parentElement;
  return (top !== null && button.contains(top)) || inert ? null : `${top?.getAttribute("data-slot") ?? top?.tagName ?? "nothing"} ${top?.className ?? ""}`;
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
  const input = page.getByRole("textbox", { name: "Message", exact: true });
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
      await toggle.click({ timeout: DOOR_TIMEOUT_MS });
    } else {
      await trigger.click({ timeout: DOOR_TIMEOUT_MS });
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
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
      await scaleRoot(page, scale.factor);
      await openContextPanel(page);
      const panel = page.locator(".shell-panel[data-panel-side='context']");
      await panel.getByRole("tab", { name: /^Members/u }).click();
      const door = panel.getByRole("button", { name: "Add a character", exact: true });
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
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(input).toBeVisible();
      await scaleRoot(page, scale.factor);
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      if (viewport.touch) {
        await emulateSoftKeyboard(page, PHONE_KEYBOARD);
      }
      await input.fill(TYPED_DRAFT);
      await expect.poll(() => findings(page.locator('[data-slot="composer"]'))).toEqual([]);
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeInViewport({ ratio: 1 });
      const send = page.getByRole("button", { name: "Send message", exact: true });
      await send.scrollIntoViewIfNeeded();
      await expect(send).toBeInViewport({ ratio: 1 });
      if (viewport.touch) {
        await emulateSoftKeyboard(page, 0);
      }
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
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      // The room scrolls once the composer and a readable transcript cannot share it, so both are reachable, not both on screen.
      for (const control of [input, page.getByRole("button", { name: "Send message", exact: true })]) {
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
  expect(await findings(page.locator('[data-planted="stacked"]'))).toContainEqual(expect.stringContaining("overlaps"));
});
