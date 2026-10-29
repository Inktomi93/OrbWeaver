// The isolated public Heatmap inherits dimensions from the actual Insights Context, never a copied shell.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { controlledPanel, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { z } from "zod";
import { CORPUS_MODE_LABELS } from "#client/lib/corpus-modes.ts";
import { channelName } from "../../../lib/appearance-channel-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";
import type { HeatmapLayoutStory } from "./_heatmap-layout-stories.tsx";

const SCENE = z.object({
  textStyle: z.object({ fontSize: z.number() }),
  width: z.number(),
  height: z.number(),
  elements: z.array(
    z.object({
      type: z.string(),
      text: z.string().nullable(),
      draggable: z.boolean(),
      invisible: z.boolean(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
});

for (const regime of [
  { name: "short desktop", viewport: { width: 1440, height: 390 }, coarse: false },
  { name: "coarse landscape", viewport: { width: 844, height: 390 }, coarse: true },
]) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });
    test("Time heatmap reserves separate hour and interactive legend paint", async ({ corpus, mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "collapsed" } } });
      const shell = await mount<typeof SectionShellStory>("tests/client/features/app-shell/_surface-stories/SectionShellStory", { section: "corpus" });
      const mode = page.getByRole("radiogroup", { name: "Corpus mode", exact: true }).getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true });
      await mode.click();
      await expect(mode).toHaveAttribute("aria-checked", "true");
      await page.getByRole("button", { name: "Show details", exact: true }).click();
      const tab = page.locator('.shell-panel[data-panel-side="context"]').getByRole("tab", { name: "Time", exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const panel = await controlledPanel(tab);
      const heatmap = panel.locator('[data-slot="heatmap"]');
      const chartHost = heatmap.locator('[data-slot="chart"]');
      await expect(chartHost.locator("canvas")).not.toHaveCount(0);
      await expect(chartHost).toBeVisible();
      await heatmap.scrollIntoViewIfNeeded();
      await test.step("Position actual Time tail (programmatic geometry, not a gesture assertion)", async () => {
        await panel.evaluate((node) => node.scrollTo(0, node.scrollHeight));
        await expect.poll(async () => await panel.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(2);
      });
      const host = await chartHost.boundingBox();
      if (host === null) {
        throw new Error("The actual Time heatmap has no rendered canvas host");
      }
      await test.info().attach("insights-heatmap-host", { body: JSON.stringify(host), contentType: "application/json" });
      await page.screenshot({ path: test.info().outputPath("Insights-Time-heatmap.png") });
      await page.setViewportSize(regime.coarse ? { width: 1440, height: 390 } : { width: 844, height: 390 });
      await expect.poll(async () => (await chartHost.boundingBox())?.width).not.toBe(host.width);
      const resizedHost = await chartHost.boundingBox();
      if (resizedHost === null) {
        throw new Error("The resized production Heatmap host disappeared");
      }
      await shell.unmount();
      const subject = await mount<typeof HeatmapLayoutStory>("tests/client/features/app-shell/surfaces/_heatmap-layout-stories/HeatmapLayoutStory", {
        width: host.width,
        height: host.height,
      });
      for (const appearance of [
        { name: "default", density: "comfortable", font: "Geist", scale: 1 },
        { name: "compact-serif-large", density: "compact", font: "Georgia", scale: 1.25 },
        { name: "comfortable-mono-small", density: "comfortable", font: "ui-monospace", scale: 0.8 },
      ] as const) {
        await page.evaluate(({ name, value }) => document.documentElement.style.setProperty(name, String(value)), {
          name: channelName("fontScale"),
          value: appearance.scale,
        });
        for (const [index, geometry] of [host, resizedHost, host].entries()) {
          await test.step(`${appearance.name}: real host resize ${String(index)}`, async () => {
            await subject.update({ width: geometry.width, height: geometry.height, density: appearance.density, font: appearance.font });
            const expectedFont = await subject
              .locator('[data-slot="heatmap-font-reference"]')
              .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
            const output = page.getByLabel("Heatmap paint bounds", { exact: true });
            await expect
              .poll(async () => {
                await page.getByRole("button", { name: "Read paint bounds", exact: true }).click();
                const scene = SCENE.parse(JSON.parse((await output.textContent()) ?? ""));
                return { width: scene.width, fontSize: scene.textStyle.fontSize };
              })
              .toEqual({ width: geometry.width, fontSize: expectedFont });
            const scene = SCENE.parse(JSON.parse((await output.textContent()) ?? ""));
            await test.info().attach(`heatmap-scene-${appearance.name}-${String(index)}`, { body: JSON.stringify(scene), contentType: "application/json" });
            await subject.locator('[data-slot="heatmap"]').screenshot({ path: test.info().outputPath(`Heatmap-${appearance.name}-${String(index)}.png`) });
            const hours = scene.elements.filter((element) => element.text !== null && /^\d{2}$/u.test(element.text) && !element.invisible);
            const legend = scene.elements.filter((element) => (element.text === "0" || element.text === "137") && !element.invisible);
            expect(hours.length).toBeGreaterThan(1);
            expect(legend).toHaveLength(2);
            const handles = scene.elements.filter((element) => element.draggable && !element.invisible);
            expect(handles.length).toBeGreaterThanOrEqual(2);
            const hourBottom = Math.max(...hours.map((element) => element.y + element.height));
            for (const element of [...legend, ...handles]) {
              expect(element.y).toBeGreaterThan(hourBottom);
              expect(element.y + element.height).toBeLessThanOrEqual(scene.height);
              expect(element.x).toBeGreaterThanOrEqual(0);
              expect(element.x + element.width).toBeLessThanOrEqual(scene.width);
            }
          });
        }
      }
    });
  });
}
