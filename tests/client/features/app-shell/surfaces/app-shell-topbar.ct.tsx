// The shell's topbar on the production registry: the narrow screen name a phone reads, the ⌘K chip's name, the phone
// row's geometry at the narrowest width, and the Characters band's doors moving to the trail while the list is the screen.
import { censusTitle } from "@orb/client/lib";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { commandShortcutLabel } from "#client/features/app-shell/lib/command-shortcut-label.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { JUMP_CHIP, resolvedLength, routeShell, SECTION_PROCEDURES, SHELL_STORIES, seedShellState } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const NARROW_TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const NARROWEST = { width: 320, height: 800 } as const;
const PHONE_WIDTHS = [320, 390] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

function library(page: Page): Locator {
  return page.locator(LIST).getByRole("list", { name: "Character library" });
}

/** How far the list pane's body starts below the pane's own top edge: the band's row when it paints, else nothing. */
function bodyOffset(page: Page): Promise<number> {
  return page.locator(LIST).evaluate((pane) => {
    const body = pane.querySelector(":scope > .shell-panel-body");
    return (body?.getBoundingClientRect().top ?? Number.NaN) - pane.getBoundingClientRect().top;
  });
}

async function routeSections(page: Page, corpus: CorpusWire): Promise<void> {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
}

function touchTarget(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-touch-target)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("an open character's screen keeps the section's name while her read is in flight, never the library census", async ({ corpus, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const census = await caller.character.count({ archived: false });
    const held = holdCorpusProcedure(caller, "character.get");
    await routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, SECTION_PROCEDURES), ...held.routes });
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const label = (await page.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).getAttribute("aria-label")) ?? "";
    const title = page.locator(NARROW_TITLE);
    // The roster arm first, so the census is proven present before the open is asked to remove it.
    await expect(title).toHaveText(censusTitle(label, census) ?? label);
    const first = library(page).getByRole("button").first();
    const name = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await first.click();
    await held.requested;
    await expect(title).toHaveText(label);
    held.release();
    await expect(title).toHaveText(name);
  });

  for (const width of PHONE_WIDTHS) {
    test(`at ${String(width)} the Characters band is shed, so one chrome row sits above the pane, and its doors ride the trail until a character opens`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await routeSections(page, corpus);
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(library(page).getByRole("button").first()).toBeVisible();
      // The band is a chrome row of its own, so a painted band puts a whole row between the pane's top and its body.
      const offset = await bodyOffset(page);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(await resolvedLength(page, "var(--dimension-chrome-row)"));
      await expect(page.locator(`${LIST} .shell-panel-header`)).toBeHidden();
      const trail = page.locator(".shell-topbar-trail");
      await expect(trail.getByRole("button", { name: "New", exact: true })).toBeVisible();
      await expect(trail.getByRole("button", { name: "Import a character card" })).toBeVisible();
      expect((await page.locator('.shell-topbar-identity[data-identity="narrow"]').boundingBox())?.width ?? 0).toBeGreaterThan(0);
      await library(page).getByRole("button").first().click();
      await expect(trail.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
    });
  }
});

test("on a desktop the Characters band keeps its own doors and the trail carries none", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof AppShellStory>(STORY, {});
  const band = page.locator(`${LIST} .shell-panel-header`);
  await expect(band).toBeVisible();
  await expect(band.getByRole("button", { name: "New", exact: true })).toBeVisible();
  await expect(page.locator(".shell-topbar-trail").getByRole("button", { name: "New", exact: true })).toHaveCount(0);
});

test("the ⌘K chip paints no text, and its name and description carry Jump and this platform's shortcut", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount<typeof AppShellStory>(STORY, {});
  const chip = page.locator(".shell-topbar-trail").getByRole("button", { name: JUMP_CHIP });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("");
  await expect(chip.locator("svg")).toHaveCount(1);
  const shortcut = commandShortcutLabel(await page.evaluate(() => navigator.userAgent));
  await expect(chip).toHaveAccessibleName(`Jump — the command menu (${shortcut})`);
  await expect(chip).toHaveAccessibleDescription(`Jump to… ${shortcut}`);
});

test.describe("the phone topbar at 320, coarse pointer", () => {
  test.use({ hasTouch: true, viewport: NARROWEST });

  test.beforeEach(async ({ corpus, page }) => {
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
    await seedShellState(page, { activeSection: "characters" });
  });

  /** Push the first character: CONTENT is the screen and the lead control is the one way back. */
  async function pushMember(page: Page): Promise<Locator> {
    await library(page).getByRole("button").first().click();
    const back = page.getByRole("button", { name: "Back to Characters", exact: true });
    await expect(back).toBeVisible();
    return back;
  }

  test("every point a thumb lands on the back button lands the back button, and it returns to the roster", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const back = await pushMember(page);
    const samples = (): Promise<string> =>
      back.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [0.1, 0.25, 0.5, 0.75, 0.9]
          .map(
            (f) =>
              document
                .elementFromPoint(box.left + box.width * f, box.top + box.height * f)
                ?.closest("button")
                ?.getAttribute("aria-label") ?? "none",
          )
          .join(" | ");
      });
    // Polled to settled: while a view transition runs, hit testing answers the snapshot, not the button.
    await expect.poll(samples).toBe(Array.from({ length: 5 }, () => "Back to Characters").join(" | "));
    await back.click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
  });

  test("the lead keeps a real box, the title outranks any control, and every control sits inside the row", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await pushMember(page);
    const lead = await page.locator(".shell-topbar-lead").boundingBox();
    const title = page.locator(NARROW_TITLE);
    await expect(title).toBeVisible();
    const trail = await page.locator(".shell-topbar-trail").boundingBox();
    expect(lead?.width ?? 0).toBeGreaterThan(await touchTarget(page));
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    expect((lead?.x ?? 0) + (lead?.width ?? 0)).toBeLessThanOrEqual((trail?.x ?? 0) + 1);
    const controls = await page.locator(".shell-topbar button").evaluateAll((elements) =>
      elements
        .filter((element) => element.checkVisibility())
        .map((element) => ({
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          width: element.getBoundingClientRect().width,
        })),
    );
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.filter((control) => control.left < 0 || control.right > NARROWEST.width)).toEqual([]);
    const widest = Math.max(...controls.map((control) => control.width));
    const roomForName = (lead?.width ?? 0) - widest;
    expect(roomForName).toBeGreaterThan(widest);
    expect(roomForName / NARROWEST.width).toBeGreaterThan(0.3);
  });

  test("the desktop-shaped ⌘K chip sheds on a phone and the palette keeps a row in the You sheet", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-rail")).toBeVisible();
    await expect(page.getByRole("button", { name: JUMP_CHIP })).toHaveCount(0);
    await page.locator(".shell-rail").getByRole("button", { name: "You", exact: true }).click();
    await expect(page.locator('[data-slot="drawer-popup"]').getByRole("button", { name: "Jump to…", exact: true })).toBeVisible();
  });

  test("the roster frame names the section and the pushed frame names the member", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator(NARROW_TITLE);
    await expect(title).toHaveText(/^Characters\b/u);
    const first = library(page).getByRole("button").first();
    const memberName = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await pushMember(page);
    await expect(title).toHaveText(memberName);
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });
});
