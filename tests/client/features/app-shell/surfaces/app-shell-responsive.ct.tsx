// The shell at phone widths on the production registry: the You sheet and its handoffs, the one-shell screens and
// their landmarks, the phone drawers and sheets, and the reading order of the tab bar.
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SNAPPED_LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { dispatchCommandKey, routeRoom, SHELL_STORIES, seedShellState, touchDrag } from "./app-shell-ct.tsx";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const PHONE = { width: 390, height: 844 } as const;
const NARROWEST = { width: 320, height: 800 } as const;

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
  return page.locator(".shell-rail").getByRole("button", { name: "You", exact: true });
}

function sheet(page: Page): Locator {
  return page.locator('[data-slot="drawer-popup"]');
}

/** Wait out `count` painted frames, the drawer's own cleanup lifetime. */
async function paintedFrames(page: Page, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

/** Push the first character in the library: on a phone a selection makes CONTENT the screen. */
async function openFirstCharacter(page: Page): Promise<void> {
  const library = page.locator(LIST).getByRole("list", { name: "Character library" });
  await library.getByRole("button").first().click();
  await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByRole("button", { name: "Back to Characters", exact: true })).toBeVisible();
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
    await sheet(page).getByRole("button", { name: "Jump to…", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Jump to…", exact: true });
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
    await expect(page.locator(".shell-topbar").getByRole("button", { name: "Report a bug" })).toHaveCount(0);
    await youTab(page).click();
    const drawer = sheet(page);
    await expect(drawer.locator('[data-slot="persona-who-head"]')).toContainText(current.name);
    await expect(drawer.locator("[data-switch-row-button]")).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
    const report = drawer.getByRole("button", { name: "Report a bug", exact: true });
    await expect(report).toHaveAttribute("aria-expanded", "false");
    await report.click();
    await expect(drawer.getByRole("textbox", { name: "What happened?" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Prepare report" })).toBeVisible();
  });

  test("its Refinery row meets the coarse row floor and routes the section, closing the sheet", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await youTab(page).click();
    const row = sheet(page).getByRole("button", { name: "Refinery", exact: true });
    await expect(row).toBeVisible();
    await expect
      .poll(() => row.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(SNAPPED_LENGTH_BASE_PX["size.control-md"]);
    await row.click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "refinery");
  });
});

test.describe("the You sheet on a short phone", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 560 } });

  test("rows below the fold are reachable by touch scrolling, and the last one closes the sheet", async ({ mount, page }) => {
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
    const faces = page.getByRole("list", { name: "Character quick-picks" });
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
    const skip = page.getByRole("button", { name: "Skip to content", exact: true });
    await skip.focus();
    await skip.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    await openFirstCharacter(page);
    await expect.poll(() => content.evaluate((element) => getComputedStyle(element).display)).not.toBe("none");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveClass(/shell-content/u);
    // One door back while pushed: the list toggle gives way to it.
    await expect(page.getByRole("button", { name: /^(?:Show|Hide) list panel|Show Characters (?:list|overview)$/u })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Show details", exact: true }).click();
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
    await page.getByRole("button", { name: "Show details", exact: true }).click();
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
    const name = page.getByRole("main").getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toBeVisible();
    const tabBar = page.locator(".shell-rail");
    await tabBar.getByRole("button", { name: "Home", exact: true }).click();
    await expect(name).toBeHidden();
    const characters = tabBar.getByRole("button", { name: "Characters", exact: true });
    await characters.click();
    await expect(name).toBeVisible();
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
    await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
    await expect(tabBar).toBeVisible();
    await expect(grid).not.toHaveAttribute("data-room-screen", /.*/u);
  });
}
