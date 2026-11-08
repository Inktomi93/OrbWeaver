// The production rail keeps its brand/footer fixed while short desktop layouts scroll section navigation.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { resolvedLength, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { PRIMARY_NAV_NAME } from "#client/lib/rail-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const GEOMETRY_EPSILON = 1;
const FONT_SCALES = [1, 1.5] as const;
const REGIMES = [
  { name: "short desktop", viewport: { width: 1440, height: 390 }, coarse: false, portrait: false },
  { name: "coarse landscape", viewport: { width: 844, height: 390 }, coarse: true, portrait: false },
  { name: "portrait bar", viewport: { width: 390, height: 844 }, coarse: true, portrait: true },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });
    for (const fontScale of FONT_SCALES) {
      test(`Refinery and Home remain reachable at font scale ${String(fontScale)}`, async ({ corpus, mount, page }, info) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", contrast: "no-preference", forcedColors: "none" });
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, fontScale } });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        });
        await seedShellState(page, { activeSection: "home" });
        await mount<typeof SectionShellStory>(STORY, { section: "home" });
        const grid = page.locator(".shell-grid");
        const rail = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true });
        const home = rail.getByRole("button", { name: SECTION_LABELS.home, exact: true });
        await expect(grid).toHaveAttribute("data-section", "home");
        await expect
          .poll(async () => await page.evaluate((name) => Number(getComputedStyle(document.documentElement).getPropertyValue(name)), channelName("fontScale")))
          .toBe(fontScale);
        await withinViewport(home);
        await info.attach("rail-before", {
          body: JSON.stringify(await rail.evaluate((node) => ({ height: node.clientHeight, total: node.scrollHeight, width: node.clientWidth }))),
          contentType: "application/json",
        });
        await page.screenshot({ path: info.outputPath("home-before-navigation.png") });

        if (regime.portrait) {
          await portraitPointer(page, rail);
        } else {
          await columnPointer(page, rail, home, info);
        }
        await expect(grid).toHaveAttribute("data-section", "refinery");
        await withinViewport(home);
        await page.screenshot({ path: info.outputPath("refinery-pointer.png") });
        await home.click();
        await expect(grid).toHaveAttribute("data-section", "home");

        if (regime.portrait) {
          await portraitReturn(rail);
        } else {
          await columnKeyboard(page, rail, home, info);
        }
        await page.screenshot({ path: info.outputPath("home-return.png") });
      });
    }
  });
}

test.describe("coarse landscape rail fade", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test("the section scroller fades only the edge with more sections beyond it", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    });
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof SectionShellStory>(STORY, { section: "home" });
    const sections = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true }).locator(".shell-rail-sections");
    const edges = async (): Promise<{ top: boolean; bottom: boolean }> =>
      await sections.evaluate((node) => ({ top: node.hasAttribute("data-fade-top"), bottom: node.hasAttribute("data-fade-bottom") }));
    await sections.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect.poll(edges).toEqual({ top: false, bottom: true });
    await sections.evaluate((node) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
    });
    await expect.poll(edges).toEqual({ top: true, bottom: true });
    await sections.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect.poll(edges).toEqual({ top: true, bottom: false });
  });
});

const LANDSCAPE_PHONES = [
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 800, height: 360 },
  { width: 915, height: 412 },
  { width: 932, height: 430 },
] as const;
// The clipped item shows at least this share of its height and hides at least this share, so the scroll reads at rest.
const PEEK_SHARE = 0.25;
const SCROLL_SECTIONS = ".shell-rail-sections";
// Enough to move the cut by most of a button, small enough that every phone still overflows.
const RAIL_RESIZE_PX = 40;
// Tall enough for the rail to hold every section on every phone above.
const GROWN_WINDOW_PX = 1200;

interface RailEdge {
  readonly overflow: number;
  readonly straddling: readonly { readonly label: string | null; readonly visible: number; readonly hidden: number; readonly height: number }[];
}

/** How far a cap may sit from its button's midline: the fit floors the midline to a whole pixel. */
const MIDLINE_EPSILON = 1;

interface RailFit {
  readonly overflow: number;
  /** The section the live bottom edge cuts through. */
  readonly cut: string | null;
  /** The live `max-block-size` in px. */
  readonly cap: number | null;
  /** The last section whose midline fits the room the rail gives the scroller uncapped; null when every section fits or fewer than two do. */
  readonly expected: { readonly label: string | null; readonly middle: number } | null;
}

/** The live cut beside the cut the rail's room calls for, read by lifting the cap and putting it back in one task, so no observer sees it. */
function railFit(scroller: HTMLElement): RailFit {
  const edge = scroller.getBoundingClientRect().bottom;
  const buttons = [...scroller.querySelectorAll(".shell-rail-button")];
  const cutting = buttons.find((button) => {
    const { top, bottom } = button.getBoundingClientRect();
    return top < edge && bottom > edge;
  });
  const cap = scroller.style.getPropertyValue("max-block-size");
  scroller.style.removeProperty("max-block-size");
  const room = scroller.clientHeight;
  const overflow = scroller.scrollHeight - room;
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const fitting = buttons
    .map((button) => {
      const { top, height } = button.getBoundingClientRect();
      return { label: button.getAttribute("aria-label"), middle: top - origin + height / 2 };
    })
    .filter(({ middle }) => middle <= room);
  if (cap !== "") {
    scroller.style.setProperty("max-block-size", cap);
  }
  return {
    overflow,
    cut: cutting?.getAttribute("aria-label") ?? null,
    cap: cap === "" ? null : Number.parseFloat(cap),
    expected: overflow > 1 && fitting.length >= 2 ? (fitting.at(-1) ?? null) : null,
  };
}

/** The rail buttons the section scroller's bottom edge cuts through, with how much of each shows. */
function railEdge(scroller: Element): RailEdge {
  const edge = scroller.getBoundingClientRect().bottom;
  const straddling = [...scroller.querySelectorAll(".shell-rail-button")].flatMap((button) => {
    const { top, bottom, height } = button.getBoundingClientRect();
    return top < edge && bottom > edge ? [{ label: button.getAttribute("aria-label"), visible: edge - top, hidden: bottom - edge, height }] : [];
  });
  return { overflow: scroller.scrollHeight - scroller.clientHeight, straddling };
}

for (const viewport of LANDSCAPE_PHONES) {
  test.describe(`phone landscape ${String(viewport.width)}x${String(viewport.height)} rail`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("shows a partly clipped next section at rest, so the scroll is obvious", async ({ corpus, mount, page }, info) => {
      await using root = await createCorpusHarness();
      await serveShell(page, corpus, root, "home");
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const sections = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true }).locator(SCROLL_SECTIONS);
      await expect.poll(async () => (await sections.evaluate(railEdge)).overflow).toBeGreaterThan(0);
      expect(await sections.evaluate((node) => node.scrollTop)).toBe(0);
      await expect
        .poll(async () => {
          const { straddling } = await sections.evaluate(railEdge);
          return straddling.length === 1 && straddling.every((cut) => cut.visible >= cut.height * PEEK_SHARE && cut.hidden >= cut.height * PEEK_SHARE);
        })
        .toBe(true);
      await info.attach("rail-edge", { body: JSON.stringify(await sections.evaluate(railEdge)), contentType: "application/json" });
      await page.screenshot({ path: info.outputPath("rail-at-rest.png") });
    });

    test("fits again to a shorter and a taller window, ending on the midline of the last button that fits", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveShell(page, corpus, root, "home");
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const sections = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true }).locator(SCROLL_SECTIONS);
      const fitsRoom = async (): Promise<boolean> => {
        const fit = await sections.evaluate(railFit);
        return (
          fit.overflow > 0 &&
          fit.expected !== null &&
          fit.cut === fit.expected.label &&
          fit.cap !== null &&
          Math.abs(fit.cap - fit.expected.middle) <= MIDLINE_EPSILON
        );
      };
      await expect.poll(fitsRoom, { message: "the cut rests on the last midline that fits at boot" }).toBe(true);
      for (const height of [viewport.height - RAIL_RESIZE_PX, viewport.height + RAIL_RESIZE_PX, viewport.height]) {
        await page.setViewportSize({ width: viewport.width, height });
        await expect.poll(fitsRoom, { message: `the cut rests on the last midline that fits at height ${String(height)}` }).toBe(true);
        const { straddling } = await sections.evaluate(railEdge);
        expect(nonEmpty(straddling).every((cut) => cut.visible >= cut.height * PEEK_SHARE && cut.hidden >= cut.height * PEEK_SHARE)).toBe(true);
      }
    });

    test("drops the bottom fade when the window grows past the sections, and brings it back when it shrinks", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveShell(page, corpus, root, "home");
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const sections = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true }).locator(SCROLL_SECTIONS);
      await expect(sections).toHaveAttribute("data-fade-bottom", "");
      // The fit writes the cap from its own observer, so the fade hook does not watch the box: only the fit's direct sync clears it.
      await page.setViewportSize({ width: viewport.width, height: GROWN_WINDOW_PX });
      await expect.poll(async () => (await sections.evaluate(railFit)).overflow, { message: "the rail holds every section" }).toBe(0);
      await expect(sections).not.toHaveAttribute("data-fade-bottom", /.*/u);
      await page.setViewportSize(viewport);
      await expect.poll(async () => (await sections.evaluate(railFit)).overflow).toBeGreaterThan(0);
      await expect(sections).toHaveAttribute("data-fade-bottom", "");
    });

    test("opens with the active section in view, and brings it back after every section change", async ({ corpus, mount, page }, info) => {
      await using root = await createCorpusHarness();
      await serveShell(page, corpus, root, "databank");
      await mount<typeof SectionShellStory>(STORY, { section: "databank" });
      const rail = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true });
      const sections = rail.locator(SCROLL_SECTIONS);
      const current = sections.locator('[aria-current="page"]');
      const inView = async (): Promise<boolean> => {
        const [scroller, active] = [await settledBox(sections), await settledBox(current)];
        return active.y >= scroller.y - GEOMETRY_EPSILON && active.y + active.height <= scroller.y + scroller.height + GEOMETRY_EPSILON;
      };
      await expect(current).toHaveAccessibleName(SECTION_LABELS.databank);
      await expect.poll(inView).toBe(true);
      await page.screenshot({ path: info.outputPath("rail-opens-on-databank.png") });
      const labels = await sections.locator(".shell-rail-button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
      // Both directions: the last section first, then each one above it, then the first section again.
      for (const label of [...labels.toReversed(), ...labels.slice(0, 1)]) {
        await page.keyboard.press("Control+KeyK");
        const palette = page.getByRole("dialog", { name: "Jump to…", exact: true });
        await palette.getByRole("combobox").fill(label);
        await palette.getByRole("option", { name: label, exact: true }).click();
        await expect(current).toHaveAccessibleName(label);
        await expect.poll(inView, { message: `${label} is in view after the change` }).toBe(true);
      }
      await page.screenshot({ path: info.outputPath("rail-after-changes.png") });
    });
  });
}

const LOOP_ERROR_MARK = "data-ro-loop-error";
// The sizes where the rail fit and the section fade both measure the scroller on boot and the box is capped.
const LOOP_ERROR_SIZES = [
  { width: 844, height: 340 },
  { width: 844, height: 430 },
  { width: 932, height: 430 },
] as const;

for (const viewport of LOOP_ERROR_SIZES) {
  test.describe(`boot at ${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    // The console ring and `console-errors=0` leave this class out of the verdict, so the page's own error event is the evidence.
    test("raises no ResizeObserver loop error while the rail fits and fades", async ({ corpus, mount, page }) => {
      await page.addInitScript((mark) => {
        globalThis.addEventListener("error", (event) => {
          if (event.message.includes("ResizeObserver loop")) {
            document.documentElement.setAttribute(mark, event.message);
          }
        });
      }, LOOP_ERROR_MARK);
      await using root = await createCorpusHarness();
      await serveShell(page, corpus, root, "home");
      await mount<typeof SectionShellStory>(STORY, { section: "home" });
      const sections = page.getByRole("navigation", { name: PRIMARY_NAV_NAME, exact: true }).locator(SCROLL_SECTIONS);
      await expect.poll(async () => (await sections.evaluate(railFit)).cap).not.toBeNull();
      await expect(sections).toHaveAttribute("data-fade-bottom", "");
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await expect(page.locator("html")).not.toHaveAttribute(LOOP_ERROR_MARK, /.+/u);
    });
  });
}

/** Serves the shell's reads from a corpus owner and seeds the section it opens on. */
async function serveShell(
  page: Page,
  corpus: Parameters<typeof createShellAmbientReads>[0],
  root: Awaited<ReturnType<typeof createCorpusHarness>>,
  section: string,
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
  });
  await seedShellState(page, { activeSection: section });
}

async function withinViewport(control: Locator): Promise<void> {
  await expect(control).toBeInViewport();
  const box = await settledBox(control);
  const viewport = await control.page().evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(-GEOMETRY_EPSILON);
  expect(box.y).toBeGreaterThanOrEqual(-GEOMETRY_EPSILON);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + GEOMETRY_EPSILON);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + GEOMETRY_EPSILON);
}

async function portraitPointer(page: Page, rail: Locator): Promise<void> {
  await expect(rail.locator(".shell-rail-sections")).toHaveCSS("display", "contents");
  await expect(rail.getByRole("button")).toHaveCount(4);
  await rail.getByRole("button", { name: "You", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: SECTION_LABELS.refinery, exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function columnPointer(page: Page, rail: Locator, home: Locator, info: TestInfo): Promise<void> {
  const refinery = rail.getByRole("button", { name: SECTION_LABELS.refinery, exact: true });
  await refinery.click();
  await withinViewport(refinery);
  const controlSize = await resolvedLength(page, `var(${TOKENS["size.control-lg"].cssVar})`);
  const chromeRow = await resolvedLength(page, `var(${TOKENS["dimension.chrome-row"].cssVar})`);
  expect((await settledBox(refinery)).height).toBeGreaterThanOrEqual(controlSize - GEOMETRY_EPSILON);
  expect((await settledBox(home)).height).toBeGreaterThanOrEqual(chromeRow - GEOMETRY_EPSILON);
  const settings = rail.getByRole("button", { name: SECTION_LABELS.settings, exact: true });
  await withinViewport(settings);
  expect((await settledBox(settings)).height).toBeGreaterThanOrEqual(controlSize - GEOMETRY_EPSILON);
  const geometry = await rail
    .locator(".shell-rail-sections")
    .evaluate((node) => ({ height: node.clientHeight, total: node.scrollHeight, position: node.scrollTop }));
  expect(geometry.total).toBeGreaterThan(geometry.height + GEOMETRY_EPSILON);
  expect(geometry.position).toBeGreaterThan(0);
  await info.attach("rail-section-scroll", { body: JSON.stringify(geometry), contentType: "application/json" });
}

async function portraitReturn(rail: Locator): Promise<void> {
  await expect(rail.getByRole("button")).toHaveCount(4);
  for (const button of await rail.getByRole("button").all()) {
    await withinViewport(button);
  }
  expect(await rail.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(GEOMETRY_EPSILON);
}

async function columnKeyboard(page: Page, rail: Locator, home: Locator, info: TestInfo): Promise<void> {
  const refinery = rail.getByRole("button", { name: SECTION_LABELS.refinery, exact: true });
  await home.focus();
  const stops = await rail.getByRole("button").count();
  for (let index = 0; index < stops && !(await refinery.evaluate((node) => node === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(refinery).toBeFocused();
  await withinViewport(refinery);
  await expect.poll(async () => await refinery.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  await page.screenshot({ path: info.outputPath("refinery-focused-before-activation.png") });
  const focusPaint = await refinery.evaluate((node) => {
    const scrollport = node.closest(".shell-rail-sections")?.getBoundingClientRect();
    const { x, y, width, height } = node.getBoundingClientRect();
    return {
      shadow: getComputedStyle(node).boxShadow,
      button: { x, y, width, height },
      scrollport: scrollport === undefined ? undefined : { x: scrollport.x, y: scrollport.y, width: scrollport.width, height: scrollport.height },
    };
  });
  await info.attach("rail-keyboard-focus-paint", { body: JSON.stringify(focusPaint), contentType: "application/json" });
  expect(focusPaint.shadow).toContain("inset");
  const target = await settledBox(refinery);
  const clip = await settledBox(rail.locator(".shell-rail-sections"));
  expect(target.x).toBeGreaterThanOrEqual(clip.x);
  expect(target.x + target.width).toBeLessThanOrEqual(clip.x + clip.width);
  expect(target.y).toBeGreaterThanOrEqual(clip.y);
  expect(target.y + target.height).toBeLessThanOrEqual(clip.y + clip.height);
  await refinery.press("Enter");
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "refinery");
  await page.screenshot({ path: info.outputPath("refinery-keyboard.png") });
  await home.click();
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
}
