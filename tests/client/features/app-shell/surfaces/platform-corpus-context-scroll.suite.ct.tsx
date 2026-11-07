// Native wheel input must reach the production Context pane through its Corpus body. A docked pane at the viewport's height keeps its
// pinned chrome and scrolls its tab panel; a sheet at the `container.cq-24` step or under it scrolls the pane body as a whole.
import { CORPUS_MODE_LABELS, contextToggleLabel } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { controlledPanel, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const SCROLL_EPSILON = 2;
const PANE_BODY = ".shell-panel-body";
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
