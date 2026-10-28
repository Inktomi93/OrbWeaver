import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const LABEL = "An explicitly named connection for the long-running collaborative story and its alternate model";
const MODEL = "gpt-6-sol";
const PLUGIN_SLUG = "layout-provider";
const PROVIDER_ID = `plugin:${PLUGIN_SLUG}/text`;
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    for (const unavailable of [false, true]) {
      test(`${unavailable ? "unavailable" : "available"} connection keeps Back and Done contained and returns keyboard focus to its row`, async ({
        mount,
        page,
      }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        const catalogFetch: typeof fetch = (input, init) => {
          const request = new Request(input, init);
          if (request.method !== "GET" || new URL(request.url).pathname !== "/v1/models") {
            throw new Error(`Unexpected connection layout request: ${request.method} ${request.url}`);
          }
          return Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
        };
        await using root = await createServerHarness({ startJobs: false, providerFetch: catalogFetch, secretBoxKey: Buffer.alloc(32, 17), pluginSpawn: spawn });
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        let connection: Awaited<ReturnType<typeof caller.connection.create>>;
        if (unavailable) {
          const manifest = pluginManifestSchema.parse({
            id: PLUGIN_SLUG,
            name: "Layout provider",
            description: "A provider removed after its genuine connection is saved.",
            version: "1.0.0",
            hostVersion: PLUGIN_HOST_VERSIONS[0],
            entry: PLUGIN_MAIN_ENTRY,
            capabilities: [],
            providers: [
              {
                id: PROVIDER_ID,
                label: "Layout endpoint",
                wire: "openai-compat",
                dialect: "openai-compatible",
                auth: "endpoint",
                apis: ["chat-completions"],
                catalog: "url",
                metered: false,
              },
            ],
          });
          const bundle = makePluginBundle(manifest, "orb.host(1);", root.clock.now());
          const plugin = await caller.plugin.install({ bundleBase64: Buffer.from(bundle).toString("base64"), grant: [] });
          await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
          connection = await caller.connection.create({
            providerId: PROVIDER_ID,
            credentialId: null,
            baseUrl: "https://models.example.test/v1",
            model: MODEL,
            label: LABEL,
          });
          await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: false });
        } else {
          const credential = await caller.credentials.add({ provider: "openai", key: "synthetic-layout-key" });
          connection = await caller.connection.create({ providerId: "openai", credentialId: credential.id, baseUrl: null, model: MODEL, label: LABEL });
        }
        expect((await caller.connection.providersAvailable()).some((row) => row.provider.id === connection.providerId)).toBe(!unavailable);
        await routeTrpc(page, serveCorpusProcedures(caller, READS));
        await mount<typeof ConnectionActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
        const opener = page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL });
        await opener.click();
        const back = page.getByRole("button", { name: "Back to Connections", exact: true });
        const done = page.getByRole("button", { name: "Done", exact: true });
        await expect(back).toBeFocused();
        await expect(
          page.locator(`[data-slot="${unavailable ? "connection-editor-unavailable" : "connection-editor"}"]`).getByText(LABEL, { exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(done).toBeFocused();
        const editor = page.locator(`[data-slot="${unavailable ? "connection-editor-unavailable" : "connection-editor"}"]`);
        const header = editor.locator('[data-slot="connection-editor-header"]');
        await expect(header).toHaveCount(1);
        const geometry = await actionGroupGeometry(header, [back, done]);
        await testInfo.attach("actual-connection-header-boxes", {
          body: JSON.stringify({ connectionId: connection.id, unavailable, ...geometry }),
          contentType: "application/json",
        });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        await expect(done).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Enter");
        await expect(back).toHaveCount(0);
        await expect(opener).toBeFocused();
      });
    }
  });
}
