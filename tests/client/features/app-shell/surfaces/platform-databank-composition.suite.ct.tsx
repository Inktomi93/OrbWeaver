import { renameActionName } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { DatabankCompositionShellStory } from "./_databank-composition-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const STORY = "tests/client/features/app-shell/surfaces/_databank-composition-stories/DatabankCompositionShellStory";
const DOCUMENT_NAME = "Northern observatory expedition notes";
const MAINTENANCE_HINT = "Use this after a settings change, or if search misses this document.";
const REBUILD_NAME = "Rebuild search index for this document";
const SOURCE_TEXT = Array.from(
  { length: 45 },
  (_, index) => `Entry ${index + 1}. The lantern illuminates the charts while {{user}} records the northern stars. <b>This remains literal source text.</b>`,
).join("\n\n");
const REGIMES = [
  { name: "wide desktop", viewport: { width: 1440, height: 900 }, coarse: false, enlarged: false, narrowIdentity: false },
  { name: "narrow desktop enlarged", viewport: { width: 800, height: 900 }, coarse: false, enlarged: true, narrowIdentity: true },
  { name: "coarse portrait", viewport: { width: 390, height: 844 }, coarse: true, enlarged: false, narrowIdentity: true },
  { name: "coarse landscape enlarged", viewport: { width: 844, height: 390 }, coarse: true, enlarged: true, narrowIdentity: true },
] as const;

async function prepare(
  root: Root,
  page: Page,
  corpus: Parameters<typeof createShellAmbientReads>[0],
  appearance: AppearanceSettings,
): Promise<{
  readonly caller: Caller;
  readonly document: Awaited<ReturnType<Caller["databank"]["get"]>>;
  readonly calls: Awaited<ReturnType<typeof routeTrpc>>;
}> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const result = await caller.databank.createFromText({ name: DOCUMENT_NAME, text: SOURCE_TEXT });
  const document = await caller.databank.get({ id: result.document.id, includeText: true });
  expect(document.extractedText).toBe(SOURCE_TEXT);
  const calls = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "databank.listGlobal", "databank.get", "databank.rename"]),
    ...serveCorpusProcedures(caller, ["databank.reindex"], () => trpcError({ code: "BAD_REQUEST", message: "This composition case does not rebuild indexes" })),
  });
  await seedShellState(page, { activeSection: "databank", panelOverrides: { databank: { list: "collapsed", context: "collapsed" } } });
  return { caller, document, calls };
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    test("the document identity follows the shell budget while rename cancellation preserves the document", async ({ mount, page, corpus }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const appearance = regime.enlarged ? ENLARGED_APPEARANCE_SETTINGS : DEFAULT_APPEARANCE_SETTINGS;
      const { caller, document, calls } = await prepare(root, page, corpus, appearance);
      await mount<typeof DatabankCompositionShellStory>(STORY, { documentId: document.id });
      const detail = page.locator('[data-slot="databank-detail-editor"]');
      await expect(detail.getByRole("heading", { level: 2, name: DOCUMENT_NAME, exact: true })).toHaveCount(1);
      const narrowTitle = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
      await expect(narrowTitle).toHaveText(DOCUMENT_NAME);
      const expectBudget = regime.narrowIdentity ? expectNarrow : expectWide;
      await expectBudget(narrowTitle);
      const paint = await detail.evaluate((node, name) => {
        const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const range = node.ownerDocument.createRange();
        let count = 0;
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (walker.currentNode.textContent === name && parent !== null && !parent.classList.contains("sr-only")) {
            range.selectNodeContents(walker.currentNode);
            count += Array.from(range.getClientRects()).filter((box) => box.width > 1 && box.height > 1).length;
          }
        }
        return count;
      }, DOCUMENT_NAME);
      expect(paint).toBe(regime.narrowIdentity ? 0 : 1);
      const rename = detail.getByRole("button", { name: renameActionName(DOCUMENT_NAME), exact: true });
      await rename.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Rename document", exact: true });
      const nameInput = dialog.getByRole("textbox", { name: "Document name", exact: true });
      await expect(nameInput).toBeFocused();
      await nameInput.fill("An abandoned document name");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(rename).toBeFocused();
      expect((await caller.databank.get({ id: document.id })).name).toBe(DOCUMENT_NAME);
      expect(calls.count("databank.rename")).toBe(0);
      expect(calls.count("databank.reindex")).toBe(0);
      await page.screenshot({ path: test.info().outputPath("document-identity.png") });
    });

    test("maintenance keeps its hint readable and its complete rebuild control contained without dispatch", async ({ mount, page, corpus }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const appearance = regime.enlarged ? ENLARGED_APPEARANCE_SETTINGS : DEFAULT_APPEARANCE_SETTINGS;
      const { document, calls } = await prepare(root, page, corpus, appearance);
      await mount<typeof DatabankCompositionShellStory>(STORY, { documentId: document.id });
      const detail = page.locator('[data-slot="databank-detail-editor"]');
      const hint = detail.getByText(MAINTENANCE_HINT, { exact: true });
      const rebuild = detail.getByRole("button", { name: REBUILD_NAME, exact: true });
      await expect(hint).toBeVisible();
      await expect(rebuild).toBeEnabled();
      await rebuild.scrollIntoViewIfNeeded();
      const floor = await resolvedLength(page, "var(--width-field-floor)", hint);
      const boxes = await hint.evaluate((node) => {
        const parent = node.parentElement;
        if (parent === null) {
          throw new Error("The maintenance hint has no action row");
        }
        return { hint: node.getBoundingClientRect().toJSON(), row: parent.getBoundingClientRect().toJSON() };
      });
      await test.info().attach("maintenance-composition", { body: JSON.stringify({ floor, boxes }), contentType: "application/json" });
      expect(boxes.hint.width).toBeGreaterThanOrEqual(Math.min(floor, boxes.row.width) - 1);
      const geometry = await actionGroupGeometry(detail, [rebuild]);
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      const control = geometry.controls[0];
      if (control === undefined) {
        throw new Error("The real rebuild control has no box");
      }
      expect(control.height).toBeGreaterThanOrEqual(await resolvedLength(page, "var(--size-control-sm)", rebuild));
      expect(calls.count("databank.reindex")).toBe(0);
      await page.screenshot({ path: test.info().outputPath("document-maintenance.png") });
    });

    test("source text remains literal and read-only within its own prose measure and scroll region", async ({ mount, page, corpus }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const appearance = regime.enlarged ? ENLARGED_APPEARANCE_SETTINGS : DEFAULT_APPEARANCE_SETTINGS;
      const { document, calls } = await prepare(root, page, corpus, appearance);
      await mount<typeof DatabankCompositionShellStory>(STORY, { documentId: document.id });
      const detail = page.locator('[data-slot="databank-detail-editor"]');
      await detail.getByRole("button", { name: "View source text", exact: true }).click();
      const source = detail.getByText(SOURCE_TEXT, { exact: true });
      await expect(source).toBeVisible();
      await expect.poll(() => source.textContent()).toBe(SOURCE_TEXT);
      const region = detail.locator('[data-slot="scroll-area-root"]');
      const viewport = region.locator('[data-slot="scroll-area-viewport"]');
      await expect(region).toHaveCount(1);
      await expect(region.getByRole("textbox")).toHaveCount(0);
      await expect(region.locator("b")).toHaveCount(0);
      expect(calls.lastInput("databank.get")).toEqual({ id: document.id, includeText: true });
      const measure = await resolvedLength(page, "var(--reading-measure-prose)", source);
      const fontFloor = await resolvedLength(page, "var(--text-label)", source);
      const available = await viewport.evaluate((node) => node.clientWidth);
      const facts = await source.evaluate((node) => {
        const style = getComputedStyle(node);
        return { width: node.getBoundingClientRect().width, font: Number.parseFloat(style.fontSize), whiteSpace: style.whiteSpace };
      });
      await test.info().attach("source-reading-measure", { body: JSON.stringify({ facts, measure, fontFloor, available }), contentType: "application/json" });
      expect(available).toBeGreaterThan(regime.name === "wide desktop" ? measure : 0);
      expect(facts.width).toBeLessThanOrEqual(measure + 1);
      expect(facts.width).toBeGreaterThanOrEqual(Math.min(measure, available) - 1);
      expect(facts.font).toBeGreaterThanOrEqual(fontFloor);
      expect(facts.whiteSpace).toBe("pre-wrap");
      await expect.poll(() => viewport.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await viewport.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("document-source.png") });
      await detail.getByRole("button", { name: "Hide source text", exact: true }).click();
      await expect(source).toHaveCount(0);
      for (const section of ["Details", "Maintenance", "Source text"]) {
        await expect(detail.getByRole("heading", { name: section, exact: true })).toBeVisible();
      }
      expect(calls.count("databank.reindex")).toBe(0);
    });
  });
}

async function expectNarrow(title: Locator): Promise<void> {
  await expect(title).toBeVisible();
}
async function expectWide(title: Locator): Promise<void> {
  await expect(title).toBeHidden();
}
