// Native wheel input must reach the production Context pane through its Corpus body. A docked pane at the viewport's height keeps its
// pinned chrome and scrolls its tab panel; a sheet at the `container.cq-24` step or under it scrolls the pane body as a whole.
import { CORPUS_MODE_LABELS, contextToggleLabel } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { controlledPanel, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const SCROLL_EPSILON = 2;
const PANE_BODY = ".shell-panel-body";
const OVERFLOW_TRIGGER = '[data-slot="context-tab-overflow-trigger"]';
for (const regime of [
  { name: "short desktop", viewport: { width: 1440, height: 390 }, coarse: false, owner: "panel" },
  { name: "coarse landscape", viewport: { width: 844, height: 390 }, coarse: true, owner: "pane" },
] as const) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });
    test("Context has one scroll owner and a reachable tail; Chromium wheel and WebKit geometry", async ({ corpus, mount, page, browserName }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      const report = await caller.discovery.portraitAlignment();
      const character = report.characters.at(0);
      if (character === undefined) {
        throw new Error("The real corpus must provide an aligned portrait row for native wheel targeting");
      }
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "settings.updateUserSettingsSection", "discovery.imageFacets", "discovery.portraitAlignment"]),
      });
      await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof SectionShellStory>(STORY, { section: "corpus" });
      await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
      const context = page.locator('.shell-panel[data-panel-side="context"]');
      const visuals = context.getByRole("tab", { name: "Visuals", exact: true });
      await visuals.click();
      await expect(visuals).toHaveAttribute("aria-selected", "true");
      const panel = await controlledPanel(visuals);
      const portrait = panel.getByRole("button", { name: character.name, exact: true });
      await expect(portrait).toBeVisible();
      await assertContextScroll({ pane: context.locator(PANE_BODY), panel, expected: regime.owner }, portrait, browserName, character.characterId);
    });
    test("the tab overflow trigger paints its focus ring inside its own box", async ({ corpus, mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
      });
      await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof SectionShellStory>(STORY, { section: "corpus" });
      await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
      const context = page.locator('.shell-panel[data-panel-side="context"]');
      const overflow = context.locator(OVERFLOW_TRIGGER);
      const hide = page.getByRole("button", { name: contextToggleLabel(false), exact: true });
      await expect(overflow).toBeVisible();
      // A key press first: only keyboard focus draws the ring. WebKit does not count a bare modifier as keyboard input; Tab is one both engines count.
      await page.keyboard.press("Tab");
      await overflow.focus();
      // The pane clips at its top edge, so a ring that draws outside the trigger loses a side; every layer must be inset.
      const own = await ringLayers(overflow);
      expect(own.length).toBeGreaterThan(0);
      expect(
        nonEmpty(own).every((layer) => /\binset\b/u.test(layer)),
        own.join(" | "),
      ).toBe(true);
      // The detector sees an outer ring: the details toggle beside the pane paints one.
      await hide.focus();
      const outer = await ringLayers(hide);
      expect(outer.some((layer) => !/\binset\b/u.test(layer))).toBe(true);
    });
    test("Insights registry tabs share the Context scroll owner and reachable tails", async ({ corpus, mount, page, browserName }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
      });
      await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof SectionShellStory>(STORY, { section: "corpus" });
      const mode = page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true });
      await mode.click();
      await expect(mode).toHaveAttribute("aria-checked", "true");
      await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
      const context = page.locator('.shell-panel[data-panel-side="context"]');
      const tabs = context.getByRole("tab");
      await expect(tabs).not.toHaveCount(0);
      const names = await tabs.allTextContents();
      for (const name of names) {
        await test.step(`Native registry Context tab: ${name}`, async () => {
          const tab = tabs.filter({ hasText: new RegExp(`^${RegExp.escape(name)}$`, "u") });
          await tab.click();
          await expect(tab).toHaveAttribute("aria-selected", "true");
          const panel = await controlledPanel(tab);
          const chart = panel.locator('[data-slot="chart"]').first();
          await expect(chart).toBeVisible();
          await expect(panel.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
          await assertContextScroll({ pane: context.locator(PANE_BODY), panel, expected: regime.owner }, chart, browserName, name);
        });
      }
    });
  });
}

/** A computed `box-shadow` split at the commas outside a colour function's parentheses. */
function shadowLayers(shadow: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < shadow.length; at += 1) {
    const character = shadow.charAt(at);
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      layers.push(shadow.slice(start, at).trim());
      start = at + 1;
    }
  }
  layers.push(shadow.slice(start).trim());
  return layers;
}

/** The focused control's box-shadow layers that paint, which is how the ring draws. */
async function ringLayers(control: Locator): Promise<readonly string[]> {
  const shadow = await control.evaluate((node) => getComputedStyle(node).boxShadow);
  const layers = shadow === "none" ? [] : shadowLayers(shadow);
  // A layer with no offset, blur or spread paints nothing, whatever its keyword.
  return layers.filter((layer) => !/ 0px 0px 0px 0px(?: inset)?$/u.test(layer));
}

interface ScrollOwners {
  readonly pane: Locator;
  readonly panel: Locator;
  /** Which of the two the regime makes the one scroller. */
  readonly expected: "pane" | "panel";
}

async function assertContextScroll(owners: ScrollOwners, witness: Locator, browserName: string, subject: string): Promise<void> {
  const page = witness.page();
  await witness.hover();
  const chain = await witness.evaluate(
    (node, paneElement) => {
      const ancestors: { slot: string | null; overflow: string; maximum: number }[] = [];
      let cursor: Element | null = node;
      while (cursor !== null) {
        const style = getComputedStyle(cursor);
        ancestors.push({ slot: cursor.getAttribute("data-slot"), overflow: style.overflowY, maximum: cursor.scrollHeight - cursor.clientHeight });
        if (cursor === paneElement) {
          return ancestors;
        }
        cursor = cursor.parentElement;
      }
      throw new Error("The actual rendered witness left its declared Context pane");
    },
    await owners.pane.elementHandle(),
  );
  // A scroller with nowhere to go is not a second scroll owner; two that both overflow are.
  expect(chain.filter((owner) => /auto|scroll/u.test(owner.overflow) && owner.maximum > SCROLL_EPSILON)).toHaveLength(1);
  const scroller = owners[owners.expected];
  const panelScrolls = await owners.panel.evaluate((node) => /auto|scroll/u.test(getComputedStyle(node).overflowY));
  expect(panelScrolls).toBe(owners.expected === "panel");
  const before = await scroller.evaluate((node) => ({ position: node.scrollTop, height: node.clientHeight, maximum: node.scrollHeight - node.clientHeight }));
  expect(before.maximum).toBeGreaterThan(2 * SCROLL_EPSILON);
  expect(before.maximum - before.position).toBeGreaterThan(SCROLL_EPSILON);
  const input = browserName === "webkit" ? "programmatic-positioning; not wheel or touch proof" : "native-wheel";
  if (browserName === "webkit") {
    await test.step("Programmatic positioning (WebKit; not wheel or touch evidence)", async () => {
      await scroller.evaluate((node, delta) => node.scrollBy(0, delta), before.maximum);
    });
  } else {
    await page.mouse.wheel(0, before.maximum);
  }
  await expect.poll(async () => await scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(before.position + SCROLL_EPSILON);
  await expect.poll(async () => await scroller.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(SCROLL_EPSILON);
  const after = await scroller.evaluate((node) => ({ position: node.scrollTop, height: node.clientHeight, maximum: node.scrollHeight - node.clientHeight }));
  await test.info().attach("corpus-context-scroll-proof", {
    body: JSON.stringify({ input, chain, before, after, subject }),
    contentType: "application/json",
  });
  await page.screenshot({ path: test.info().outputPath(`${subject}-context-tail.png`) });
}
