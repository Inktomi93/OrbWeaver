import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { pluginDetailsLabel, updateAvailableLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginActionGroupsStory, PluginInstallActionsStory } from "./_update-action-groups-stories.tsx";

const STORY = "tests/client/features/plugin/components/_update-action-groups-stories/PluginActionGroupsStory";
const SOURCE = "https://updates.example.test/action-group.zip";
const NEXT_VERSION = "999999999.999999999.999999999";
const REGIMES = [
  {
    name: "wide desktop",
    width: 960,
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    fontScale: appearanceSettingsSchema.parse({}).fontScale,
  },
  {
    name: "narrow desktop enlarged",
    width: 300,
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale,
  },
  {
    name: "phone portrait enlarged",
    width: 390,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale,
  },
  {
    name: "phone landscape enlarged",
    width: 844,
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale,
  },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.isMobile, hasTouch: regime.hasTouch });

    test("a supported long update version keeps both actions visible and keyboard reachable", async ({ mount, page }, testInfo) => {
      const appearance = appearanceSettingsSchema.parse({ fontScale: regime.fontScale });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      const manifest = pluginManifestSchema.parse({
        id: "action-group-update",
        name: "Action group update witness",
        description: "A synthetic bundle for the real update source and action layout.",
        version: "1.0.0",
        hostVersion: PLUGIN_HOST_VERSIONS[0],
        entry: PLUGIN_MAIN_ENTRY,
        capabilities: [],
      });
      let bundle: Uint8Array = new Uint8Array();
      const download: typeof fetch = (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== SOURCE) {
          throw new Error(`Unexpected update source: ${url}`);
        }
        return Promise.resolve(new Response(Uint8Array.from(bundle), { headers: { "content-type": "application/zip" } }));
      };
      await using root = await createServerHarness({
        startJobs: false,
        networkExecution: { fetch: download, resolver: (): Promise<readonly string[]> => Promise.resolve(["93.184.215.14"]) },
      });
      const caller = await root.internalCallerFor(root.ownerId);
      bundle = makePluginBundle(manifest, "orb.host(1);", root.clock.now());
      const preview = await caller.plugin.previewFromUrl({ url: SOURCE });
      const installed = await caller.plugin.installFromUrl({ url: SOURCE, expectedBundleHash: preview.bundleHash, grant: [] });
      expect(installed.version).toBe(manifest.version);
      bundle = makePluginBundle(pluginManifestSchema.parse({ ...manifest, version: NEXT_VERSION }), "orb.host(1);", root.clock.now());
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "plugin.list",
          "plugin.listSurfaces",
          "plugin.getLog",
          "plugin.checkForUpdates",
        ]),
      );
      await mount<typeof PluginActionGroupsStory>(STORY, { width: regime.width, appearance });
      await page.getByRole("button", { name: pluginDetailsLabel(manifest.name), exact: true }).click();
      const check = page.getByRole("button", { name: `Check ${manifest.name} for updates`, exact: true });
      await check.click();
      const update = page.getByRole("button", { name: `Update ${manifest.name} to ${NEXT_VERSION}`, exact: true });
      await expect(update).toHaveText(updateAvailableLabel(NEXT_VERSION));
      await check.focus();
      await page.keyboard.press("Tab");
      await expect(update).toBeFocused();
      await expect(update).toBeInViewport({ ratio: 1 });
      const group = check.locator("..");
      const geometry = await actionGroupGeometry(group, [check, update]);
      await testInfo.attach("actual-update-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      const contentOverflow = await update.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(contentOverflow).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-sm)", group);
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
    });

    test("distribution actions remain contained and Cancel does not publish the bundle", async ({ mount, page }, testInfo) => {
      const appearance = appearanceSettingsSchema.parse({ fontScale: regime.fontScale });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const manifest = pluginManifestSchema.parse({
        id: "action-distribution",
        name: "Distribution layout witness",
        description: "A synthetic bundle whose fan-out is never requested by this layout test.",
        version: "1.0.0",
        hostVersion: PLUGIN_HOST_VERSIONS[0],
        entry: PLUGIN_MAIN_ENTRY,
        capabilities: [],
      });
      const bundle = makePluginBundle(manifest, "orb.host(1);", root.clock.now());
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "plugin.listDistributed"]));
      await mount<typeof PluginActionGroupsStory>(STORY, { width: regime.width, appearance, distribution: true });
      await page.locator('input[type="file"]').setInputFiles({ name: "layout-witness.zip", mimeType: "application/zip", buffer: Buffer.from(bundle) });
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      await expect(cancel).toBeVisible();
      const group = cancel.locator("..");
      const distribute = group.getByRole("button").first();
      await expect(distribute).toContainText(/Distribute/u);
      await distribute.focus();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      const geometry = await actionGroupGeometry(group, [distribute, cancel]);
      await testInfo.attach("actual-distribution-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await page.keyboard.press("Enter");
      await expect(cancel).toHaveCount(0);
      expect(calls.count("plugin.installForAllUsers")).toBe(0);
    });

    test("install consent actions remain contained and Cancel does not install the preview", async ({ mount, page }, testInfo) => {
      const appearance = appearanceSettingsSchema.parse({ fontScale: regime.fontScale });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const manifest = pluginManifestSchema.parse({
        id: "install-actions",
        name: "Install action witness",
        description: "A bundle preview for the real install consent actions.",
        version: "1.0.0",
        hostVersion: PLUGIN_HOST_VERSIONS[0],
        entry: PLUGIN_MAIN_ENTRY,
        capabilities: [],
      });
      const bundle = makePluginBundle(manifest, "orb.host(1);", root.clock.now());
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "plugin.list"]));
      await mount<typeof PluginInstallActionsStory>("tests/client/features/plugin/components/_update-action-groups-stories/PluginInstallActionsStory", {
        width: regime.width,
        appearance,
      });
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({ name: "install-actions.zip", mimeType: "application/zip", buffer: Buffer.from(bundle) });
      await expect(page.getByRole("heading", { name: `Review ${manifest.name} ${manifest.version}`, exact: true })).toBeVisible();
      const install = page.getByRole("button", { name: "Install", exact: true });
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      await expect(install).toBeEnabled();
      await install.focus();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      const group = cancel.locator("..");
      const geometry = await actionGroupGeometry(group, [install, cancel]);
      await testInfo.attach("actual-install-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-md)", group);
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
      await page.keyboard.press("Enter");
      await expect(cancel).toHaveCount(0);
      expect(calls.count("plugin.install")).toBe(0);
    });
  });
}
