// The topbar, the room and the character Import dialog on the production shell at enlarged text: 200% (WCAG 1.4.4 text
// resize) and 300% layout, at the phone and desktop viewports, on Chromium and the opt-in WebKit project. The appearance
// setting is bounded by `FONT_SCALE`, so these scales are the root multiplier the writer carries; `:root { font-size }` multiplies it the
// same way, but a `rem` inside a media query stays at the platform default, so a browser whose own default is 200% would
// also flip the shell regime. Every surface runs every cell of EVERY_CELL; an exception is named beside it in QUALIFIED.

import { contextToggleLabel, testId } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellCharacterStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { PlantedControlsStory } from "./_text-scale-probe-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const PROBE_STORIES = "tests/client/features/app-shell/surfaces/_text-scale-probe-stories";
const PHONE = { name: "phone", touch: true, size: { width: 390, height: 844 } } as const;
const NARROW = { name: "narrow phone", touch: true, size: { width: 320, height: 568 } } as const;
const DESKTOP = { name: "desktop", touch: false, size: { width: 1440, height: 900 } } as const;
const TEXT_200 = { name: "200% text", factor: 2 } as const;
const LAYOUT_300 = { name: "300% layout", factor: 3 } as const;
// The character band's chip row scrolls by ruling: it keeps each chip whole rather than wrap into a ragged void.
const SIDEWAYS_STRIPS = 'input, textarea, [role="tablist"], [role="toolbar"], [data-slot="character-context-band"] > * > *';
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

const QUALIFIED = {
  topbar: [...EVERY_CELL, NARROW_CELL],
  contextHeader: EVERY_CELL,
  roomContext: [...EVERY_CELL, NARROW_CELL],
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

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
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
    const scrolls = (axis: string, before: number): boolean => events.slice(0, before).some((event) => event.axis === axis && event.kind === "scroll");
    const cut = events.find((event, index) => event.kind === "clip" && !scrolls(event.axis, index));
    if (cut !== undefined) {
      return `clipped on ${cut.axis} by ${label(cut.ancestor)}`;
    }
    const past = spans(box, { left: 0, right: innerWidth, top: 0, bottom: innerHeight }).filter((axis) => !scrolls(axis, events.length));
    return past.length === 0 ? null : `past the viewport edge on ${past.join("")}`;
  };
  const coveredBy = (element: Element, box: DOMRect): Element | null => {
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
    return cover === null ? null : `${label(element)} ${at} is covered at its centre by ${label(cover)} ${cover.className}`;
  };
  return [...subject.querySelectorAll(reachable)]
    .filter(
      (element) =>
        element.checkVisibility({ visibilityProperty: true }) &&
        element.closest("[inert]") === null &&
        getComputedStyle(element).pointerEvents !== "none" &&
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
  return painted.flatMap((element, index) =>
    painted.slice(index + 1).flatMap((other) => {
      const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
      const inline = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const block = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlap = inline > subpixel && block > subpixel && !element.contains(other) && !other.contains(element);
      return overlap && scrollerOf(element) === scrollerOf(other) ? [`"${name(element)}" overlaps "${name(other)}"`] : [];
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

async function findings(scope: Locator): Promise<string[]> {
  const controls = await scope.evaluate(clippedControls, { reachable: REACHABLE, subpixel: SUBPIXEL });
  const overlaps = await scope.evaluate(overlappingControls, { reachable: REACHABLE, subpixel: SUBPIXEL });
  const text = await scope.evaluate(cutOffText, { subpixel: SUBPIXEL });
  const columns = await scope.evaluate(sidewaysColumns, { strips: SIDEWAYS_STRIPS, subpixel: SUBPIXEL });
  return [...controls, ...overlaps, ...text, ...columns];
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

/** Opens the corpus' first chat room on the production shell and returns its message field; `mountShell` mounts the shell story. */
async function openFirstRoom(mountShell: () => Promise<unknown>, page: Page): Promise<Locator> {
  await seedShellState(page, { activeSection: "chats" });
  await mountShell();
  // The boot already lands in Chats. A rail press on the active section still raises a view transition, and a row press that
  // lands inside it is released over the transition's overlay, so the pointer-up misses the row and no click reaches it.
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "chats");
  await page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button").first().click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(input).toBeVisible();
  return input;
}

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
      await openFirstRoom(() => mount<typeof AppShellStory>(STORY, {}), page);
      await scaleRoot(page, scale.factor);
      await openContextPanel(page);
      const panel = page.locator(".shell-panel[data-panel-side='context']");
      await expect(panel.locator("[data-slot='context-bracket-header']")).toBeInViewport();
      await expect.poll(() => findings(panel)).toEqual([]);
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
      await openFirstRoom(() => mount<typeof AppShellStory>(STORY, {}), page);
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
      const input = await openFirstRoom(() => mount<typeof AppShellStory>(STORY, {}), page);
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
      await openFirstRoom(() => mount<typeof AppShellStory>(STORY, {}), page);
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
      await openFirstRoom(() => mount<typeof AppShellStory>(STORY, {}), page);
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
      await page.getByRole("button", { name: /^Import/u }).click();
      const dialog = page.getByRole("dialog");
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
