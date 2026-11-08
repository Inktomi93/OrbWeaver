// A plugin frame follows the viewer's appearance font scale through the real mint and served document: rem text
// scales, authored px text and authored fixed-size boxes keep their size, and a narrow host never overflows.
import { spawn } from "node:child_process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { PLUGIN_FRAME_ROUTE, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ENTRY, PLUGIN_UI_ROUTE, pluginManifestSchema } from "@orb/contracts/plugin";
import { FONT_SCALE } from "@orb/kit/font-scale";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { strToU8 } from "fflate";
import type { PluginFrameTextScaleStory } from "./_consent-layout-stories.tsx";

const STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginFrameTextScaleStory";
const FRAME_TITLE = "Scale witness: Frame preferences";
const { min: MIN_SCALE, max: MAX_SCALE } = FONT_SCALE;
// A scale no stored setting can hold, written straight onto the root: the frame must stop at the bound.
const PLANTED_SCALE = MAX_SCALE + 1;
const FIXED_BOX_PX = 800;
const FRAME_HTML = `<p id="rem" style="font-size:1rem;margin:0">rem text</p><p id="px" style="font-size:16px;margin:0">px text</p><div id="box" style="width:${String(FIXED_BOX_PX)}px;height:20px"></div>`;
const PLUGIN_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "plugin.getSurfaceState",
  "plugin.listBundleAssets",
  "plugin.listDistributed",
  "connection.listBindings",
  "connection.list",
  "plugin.getLog",
  "plugin.checkForUpdates",
] as const;
const WIDTHS = [390, 320] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function routeFrames(page: Page, root: Root): Promise<void> {
  const auth = await captureCookieAuth(root, await root.principalFor(root.ownerId), "plugin-scale-viewer-password");
  for (const prefix of [PLUGIN_UI_ROUTE, PLUGIN_FRAME_ROUTE]) {
    await page.route(`**${prefix}{,/**}`, async (route) => {
      const request = route.request();
      const response = await root.http.request(new URL(request.url()).pathname, {
        method: request.method(),
        headers: { cookie: auth.cookie, forwarded: "", [CSRF_HEADER]: "1", "content-type": request.headers()["content-type"] ?? "application/json" },
        ...(request.postData() === null ? {} : { body: request.postData() ?? "" }),
      });
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
  }
}

const sizeIn = (page: Page, selector: string, property: "font-size" | "width"): Promise<number> =>
  page
    .frameLocator(`iframe[title="${FRAME_TITLE}"]`)
    .locator(selector)
    .evaluate((node, name) => Number.parseFloat(getComputedStyle(node).getPropertyValue(name)), property);

for (const width of WIDTHS) {
  test(`a plugin frame's rem text follows the appearance font scale at ${String(width)}px; authored px text and fixed boxes keep their size`, async ({
    page,
    mount,
  }) => {
    await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
    const caller = await root.internalCallerFor(root.ownerId);
    const manifest = pluginManifestSchema.parse({
      id: "scale-witness",
      name: "Scale witness",
      description: "A frame carrying rem, px and fixed-size content.",
      version: "1.0.0",
      hostVersion: PLUGIN_HOST_VERSIONS[0],
      entry: PLUGIN_MAIN_ENTRY,
      uiEntry: PLUGIN_UI_ENTRY,
      capabilities: ["ui.surface", "ui.frame"],
    });
    const source = `const host=orb.host(1);host.ui.registerFrame({id:"frame",anchor:"settings",title:"Frame preferences",html:${JSON.stringify(FRAME_HTML)}});`;
    const plugin = await caller.plugin.install({
      bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8("") })).toString("base64"),
      grant: manifest.capabilities,
    });
    await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
    await routeFrames(page, root);
    await routeTrpc(page, serveCorpusProcedures(caller, PLUGIN_READS));
    const component = await mount<typeof PluginFrameTextScaleStory>(STORY, { width, fontScale: 1 });
    try {
      const frame = page.locator(`iframe[title="${FRAME_TITLE}"]`);
      await frame.scrollIntoViewIfNeeded();
      await expect(page.frameLocator(`iframe[title="${FRAME_TITLE}"]`).locator("#px")).toBeVisible();
      const fixedText = await sizeIn(page, "#px", "font-size");
      for (const [written, served] of [
        [MAX_SCALE, MAX_SCALE],
        [MIN_SCALE, MIN_SCALE],
        [PLANTED_SCALE, MAX_SCALE],
      ] as const) {
        await component.update({ width, fontScale: written });
        // A re-minted frame is a new lazy iframe: it loads once it is on screen.
        await frame.scrollIntoViewIfNeeded();
        await expect.poll(() => sizeIn(page, "#rem", "font-size"), `scale ${String(written)}`).toBe(fixedText * served);
        expect(await sizeIn(page, "#px", "font-size")).toBe(fixedText);
        expect(await sizeIn(page, "#box", "width")).toBe(FIXED_BOX_PX);
        const hosted = await frame.boundingBox();
        expect(hosted?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      }
    } finally {
      await component.unmount();
    }
  });
}
