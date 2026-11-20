// The shell at phone widths on the production registry: the You sheet and its handoffs, the one-shell screens and
// their landmarks, the phone drawers and sheets, and the reading order of the tab bar.

import { contextToggleLabel, PRIMARY_NAV_NAME, sectionBackName, YOU_TAB_LABEL } from "@orb/client/lib";
import { dispatchCommandKey, seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { LENGTH_BASE_PX, MEDIA_QUERIES, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { BUG_REPORT_NAME, BUG_REPORT_NOTE_NAME, bugReportPrepareLabel, SKIP_TO_CONTENT_NAME } from "#client/features/app-shell/lib/app-shell-names.ts";
import { CHARACTER_HERO_NAME_FIELD_NAME, CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { HOME_QUICK_PICKS_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { COMMAND_MODAL_TITLE } from "#client/features/chat/lib/command-palette-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES, touchDrag } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const PHONE = { width: 390, height: 844 } as const;
const NARROWEST = { width: 320, height: 800 } as const;
const WARM_MARK = "warmEditorMark";
// A held swipe far enough to carry an unclipped sheet well past the tab bar's top edge, short of a dismiss.
const SWIPE_DOWN_PX = 80;
const SWIPE_STEPS = 8;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

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

function youTab(page: Page): Locator {
  return page.locator(".shell-rail").getByRole("button", { name: YOU_TAB_LABEL, exact: true });
}

function sheet(page: Page): Locator {
  return page.locator('[data-slot="drawer-popup"]');
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element has no box");
  }
  return box;
}

/** The four corners, two px in, and the centre of a box: where a finger can land on it. */
function hitPoints(box: Box): readonly { readonly x: number; readonly y: number }[] {
  return [
    { x: box.x + 2, y: box.y + 2 },
    { x: box.x + box.width - 2, y: box.y + 2 },
    { x: box.x + 2, y: box.y + box.height - 2 },
    { x: box.x + box.width - 2, y: box.y + box.height - 2 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  ];
}

/** Wait out `count` painted frames, the drawer's own cleanup lifetime. */
async function paintedFrames(page: Page, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

/** Push the first character in the library: on a phone a selection makes CONTENT the screen. */
async function openFirstCharacter(page: Page): Promise<void> {
  const library = page.locator(LIST).getByRole("list", { name: CHARACTER_LIBRARY_NAME });
  await library.getByRole("button").first().click();
  await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByRole("button", { name: sectionBackName(SECTION_LABELS.characters), exact: true })).toBeVisible();
}

test.describe("the You sheet", () => {
  test.use({ hasTouch: true, viewport: PHONE });

  test("its close and its Jump handoff both return focus to the You tab, and Search takes typing through the handoff", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await youTab(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(youTab(page)).toBeFocused();

    await youTab(page).click();
    await sheet(page).getByRole("button", { name: COMMAND_MODAL_TITLE, exact: true }).click();
    const palette = page.getByRole("dialog", { name: COMMAND_MODAL_TITLE, exact: true });
    const search = palette.getByRole("combobox");
    await expect(search).toBeFocused();
    await page.keyboard.type("r");
    await expect(search).toHaveValue("r");
    // Past the drawer's own cleanup frames, focus is still the palette's.
    await paintedFrames(page, 3);
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(youTab(page)).toBeFocused();
  });

  test("it ends above the tab bar, which stays in view under its scrim and inert: out of the accessibility tree, a tap on any tab only closes the sheet, and focus returns to the You tab", async ({
    mount,
    page,
  }) => {
    await mount<typeof AppShellStory>(STORY, {});
    expect(await page.evaluate((pointerCoarse) => matchMedia(pointerCoarse).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
    const tab = youTab(page);
    const bar = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true });
    await expect(bar).toHaveCount(1);
    const section = await page.locator(".shell-grid").getAttribute("data-section");
    // The open sheet hides the page behind it from assistive tech, so the painted tabs are found by their own stamps.
    const barYou = page.locator('.shell-rail [data-modal-trigger="you"]');
    const barChats = page.locator(`.shell-rail [data-mobile="tab"][aria-label=${JSON.stringify(SECTION_LABELS.chats)}]`);
    const drawer = sheet(page);
    /** Each tab's box, open the sheet, and prove what the bar is while it is up. */
    const openOverInertBar = async (): Promise<{ readonly you: Box; readonly chats: Box }> => {
      await tab.tap();
      await expect(drawer).toBeVisible();
      await expect(bar).toHaveCount(0);
      const you = await boxOf(barYou);
      const chats = await boxOf(barChats);
      expect(you.height).toBeGreaterThanOrEqual(LENGTH_BASE_PX["size.control-md"]);
      expect(await drawer.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(you.y + 1);
      // Every corner and the centre of each tab lands on the sheet's scrim, never on the tab under it.
      for (const box of [you, chats]) {
        for (const point of hitPoints(box)) {
          expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-slot") ?? null, point)).toBe("drawer-backdrop");
        }
      }
      return { you, chats };
    };

    const first = await openOverInertBar();
    await page.touchscreen.tap(first.you.x + first.you.width / 2, first.you.y + first.you.height / 2);
    await expect(drawer).toHaveCount(0);
    await expect(bar).toHaveCount(1);
    await expect(tab).toBeFocused();

    const second = await openOverInertBar();
    await page.touchscreen.tap(second.chats.x + second.chats.width / 2, second.chats.y + second.chats.height / 2);
    await expect(drawer).toHaveCount(0);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section ?? "");
    await expect(tab).toBeFocused();
  });

  test("a swipe that drags the sheet down never carries it over the tab bar: the sheet's viewport clips it at the bar's edge", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await youTab(page).tap();
    const drawer = sheet(page);
    await expect(drawer).toBeVisible();
    const bar = await boxOf(page.locator(".shell-rail"));
    const title = await boxOf(drawer.locator('[data-slot="drawer-title-text"]'));
    const start = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= SWIPE_STEPS; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x, y: start.y + (SWIPE_DOWN_PX * step) / SWIPE_STEPS }] });
    }
    // Held mid-swipe: the sheet's own box now runs past the bar's top edge, so the hit test below can fail.
    await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().bottom)).toBeGreaterThan(bar.y + SWIPE_DOWN_PX / 2);
    const strip = { x: bar.x, y: bar.y, width: bar.width, height: SWIPE_DOWN_PX / 2 };
    for (const point of hitPoints(strip)) {
      expect(await drawer.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), point)).toBe(false);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  });

  test("it names who a new chat starts you as, offers no theme switch, and keeps Report a bug off the topbar as an inline form", async ({
    corpus,
    mount,
    page,
  }) => {
    const [settings] = corpus.reads["settings.getUserSettings"];
    const [personas] = corpus.reads["persona.list"];
    const current = personas?.output.find((persona) => persona.id === settings?.output.config.seeds.currentPersonaId);
    if (current === undefined) {
      throw new Error("The corpus viewer has no current persona");
    }
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-topbar").getByRole("button", { name: BUG_REPORT_NAME })).toHaveCount(0);
    await youTab(page).click();
    const drawer = sheet(page);
    await expect(drawer.locator('[data-slot="persona-who-head"]')).toContainText(current.name);
    await expect(drawer.locator("[data-switch-row-button]")).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: SECTION_LABELS.settings, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
    const report = drawer.getByRole("button", { name: BUG_REPORT_NAME, exact: true });
    await expect(report).toHaveAttribute("aria-expanded", "false");
    await report.click();
    await expect(drawer.getByRole("textbox", { name: BUG_REPORT_NOTE_NAME })).toBeVisible();
    await expect(drawer.getByRole("button", { name: bugReportPrepareLabel(false) })).toBeVisible();
  });

  test("its Refinery row meets the coarse row floor and routes the section, closing the sheet", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    expect(await page.evaluate((pointerCoarse) => matchMedia(pointerCoarse).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
    await youTab(page).click();
    const row = sheet(page).getByRole("button", { name: SECTION_LABELS.refinery, exact: true });
    await expect(row).toBeVisible();
    await expect.poll(() => row.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(LENGTH_BASE_PX["size.control-md"]);
    await row.click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "refinery");
  });
});

test.describe("the You sheet on a short phone", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 560 } });

  test("rows below the fold are reachable by touch scrolling", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await youTab(page).click();
    const drawer = sheet(page);
    await expect(drawer).toBeVisible();
    const last = drawer.getByRole("button").last();
    await expect(last).not.toBeInViewport({ ratio: 1 });
    for (let drag = 0; drag < 4 && !(await last.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight)); drag += 1) {
      const before = (await last.boundingBox())?.y ?? Number.NaN;
      await touchDrag(page, { x: 24, y: 480 }, { x: 24, y: 160 });
      await expect.poll(async () => (await last.boundingBox())?.y ?? Number.NaN).toBeLessThan(before);
    }
    await expect(last).toBeInViewport({ ratio: 1 });
  });
});

test.describe("one shell at the narrowest phone", () => {
  test.use({ hasTouch: true, viewport: NARROWEST });

  test("Home, which has no list, lands on its content with the list track closed", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.locator("main.shell-content")).toBeVisible();
    // The content region spends no inline padding of its own on a phone, so Home's swipe shelf reaches both edges.
    const faces = page.getByRole("list", { name: HOME_QUICK_PICKS_NAME });
    await expect(faces.getByRole("button").first()).toBeVisible();
    await expect
      .poll(() =>
        faces.evaluate((list) => {
          const shelf = list.parentElement?.getBoundingClientRect();
          const main = list.closest("main")?.getBoundingClientRect();
          return shelf === undefined || main === undefined ? null : [Math.round(shelf.left - main.left), Math.round(main.right - shelf.right)];
        }),
      )
      .toEqual([0, 0]);
    await expect
      .poll(() =>
        page
          .locator("main.shell-content .shell-region-fill")
          .first()
          .evaluate((element) => getComputedStyle(element).paddingInlineStart),
      )
      .toBe("0px");
  });

  test("closed drawers are a full viewport wide and wholly off screen", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    for (const side of [LIST, CONTEXT]) {
      const panel = page.locator(side);
      await expect(panel).toHaveAttribute("data-panel-mode", "collapsed");
      await expect.poll(() => panel.evaluate((element) => Number.parseFloat(getComputedStyle(element).width))).toBeCloseTo(NARROWEST.width, 0);
      await expect
        .poll(() =>
          panel.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return box.right <= 0 || box.left >= innerWidth;
          }),
        )
        .toBe(true);
    }
  });

  test("a roster is the screen from the left edge, unscrimmed, the one main the skip lands on; a pushed member makes content the screen", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const content = page.locator(".shell-content");
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(async () => (await list.boundingBox())?.x).toBe(0);
    expect((await list.boundingBox())?.width ?? 0).toBeCloseTo(NARROWEST.width, 1);
    await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
    // The content frame behind the roster does not paint at all.
    await expect.poll(() => content.evaluate((element) => getComputedStyle(element).display)).toBe("none");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveAttribute("data-panel-side", "list");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("button", { name: SKIP_TO_CONTENT_NAME, exact: true });
    await skip.focus();
    await skip.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    await openFirstCharacter(page);
    await expect.poll(() => content.evaluate((element) => getComputedStyle(element).display)).not.toBe("none");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveClass(/shell-content/u);
    // One door back while pushed: the list toggle gives way to it.
    await expect(
      page.getByRole("button", { name: new RegExp(`^(?:Show|Hide) list panel|Show ${RegExp.escape(SECTION_LABELS.characters)} (?:list|overview)$`, "u") }),
    ).toHaveCount(0);
  });

  test("on a phone the tab bar follows the content in DOM order", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-rail")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".shell-grid")
          .evaluate(
            (grid) =>
              [...grid.children].findIndex((child) => child.classList.contains("shell-main")) <
              [...grid.children].findIndex((child) => child.classList.contains("shell-rail")),
          ),
      )
      .toBe(true);
  });

  test("a pushed member's details sheet floats with the house elevation over inert content, and its band's close dismisses it", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await openFirstCharacter(page);
    const context = page.locator(CONTEXT);
    const content = page.locator(".shell-content");
    await expect(context.getByRole("button", { name: /^Close /u })).toHaveCount(0);
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect.poll(() => context.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    await expect(content).toHaveAttribute("inert", "");
    await context
      .getByRole("button", { name: /^Close /u })
      .first()
      .click();
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(content).not.toHaveAttribute("inert", "");
  });

  test("the details sheet rides the shell's own overlay rung, and a portalled palette still covers it", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await openFirstCharacter(page);
    const context = page.locator(CONTEXT);
    await expect(page.locator(".shell-grid")).toHaveCSS("isolation", "isolate");
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    const ownerAt = (x: number, y: number): Promise<string> =>
      page.evaluate(
        ({ px, py }) => {
          const hit = document.elementFromPoint(px, py);
          if ((hit?.closest('[data-slot="portal-root"]') ?? null) !== null) {
            return "portal";
          }
          return (hit?.closest('.shell-panel[data-panel-side="context"]') ?? null) === null ? (hit?.tagName.toLowerCase() ?? "none") : "sheet";
        },
        { px: x, py: y },
      );
    // The sheet owns the tab bar's row too, and the middle of the screen.
    await expect.poll(() => ownerAt(NARROWEST.width / 2, NARROWEST.height - 8)).toBe("sheet");
    await expect.poll(() => ownerAt(NARROWEST.width / 2, NARROWEST.height / 2)).toBe("sheet");
    await expect(context).toHaveCSS("z-index", TOKENS["z.overlay"].value);
    expect(await dispatchCommandKey(page, { metaKey: true })).toBe(true);
    await expect(page.locator('[data-slot="portal-root"] [role="dialog"]')).toHaveCount(1);
    await expect(page.locator('.shell-grid [role="dialog"]')).toHaveCount(0);
    await expect.poll(() => ownerAt(NARROWEST.width / 2, NARROWEST.height / 2)).toBe("portal");
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  });

  test("returning to Characters through the tab bar keeps focus on the Characters tab over a warm editor", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await openFirstCharacter(page);
    const name = page.getByRole("main").getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true });
    await expect(name).toBeVisible();
    // An expando on the editor's own node: a remount builds a new node and the mark is gone.
    await name.evaluate((node, mark) => Reflect.set(node, mark, true), WARM_MARK);
    const tabBar = page.locator(".shell-rail");
    await tabBar.getByRole("button", { name: SECTION_LABELS.home, exact: true }).click();
    await expect(name).toBeHidden();
    const characters = tabBar.getByRole("button", { name: SECTION_LABELS.characters, exact: true });
    await characters.click();
    await expect(name).toBeVisible();
    expect(await name.evaluate((node, mark) => Reflect.get(node, mark) === true, WARM_MARK)).toBe(true);
    await expect(characters).toBeFocused();
  });
});

test("on a desktop the rail reads first and the content column keeps the one main", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof AppShellStory>(STORY, {});
  await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
  await expect
    .poll(() =>
      page
        .locator(".shell-grid")
        .evaluate(
          (grid) =>
            [...grid.children].findIndex((child) => child.classList.contains("shell-rail")) <
            [...grid.children].findIndex((child) => child.classList.contains("shell-main")),
        ),
    )
    .toBe(true);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveClass(/shell-content/u);
  await expect(page.locator(LIST)).not.toHaveAttribute("role", "main");
});

for (const viewport of [NARROWEST, PHONE]) {
  test(`at ${String(viewport.width)} an open room stands the tab bar down and runs to the grid's bottom edge, and Back restores the bar`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const tabBar = page.locator(".shell-rail");
    const grid = page.locator(".shell-grid");
    await expect(tabBar).toBeVisible();
    await page.locator(`${LIST} [data-slot="list-row-title"]`).first().click();
    await expect(page.locator('[data-slot="composer"]')).toBeVisible();
    await expect(tabBar).toHaveCount(0);
    await expect(grid).toHaveAttribute("data-room-screen", "true");
    const gridBox = await grid.boundingBox();
    await expect
      .poll(async () => {
        const main = await page.locator(".shell-main").boundingBox();
        return (main?.y ?? 0) + (main?.height ?? 0);
      })
      .toBeCloseTo((gridBox?.y ?? 0) + (gridBox?.height ?? 0), 0);
    await page.getByRole("button", { name: sectionBackName(SECTION_LABELS.chats), exact: true }).click();
    await expect(tabBar).toBeVisible();
    await expect(grid).not.toHaveAttribute("data-room-screen", /.*/u);
  });
}
