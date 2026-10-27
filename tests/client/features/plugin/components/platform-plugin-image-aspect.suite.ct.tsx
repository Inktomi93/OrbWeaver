// Installed declarations exercise the real image renderer and owner-scoped CAS resolver. Only the
// broken-media case replaces the blob HTTP response; omitted aspect remains an intrinsic-size control.
import { spawn } from "node:child_process";
import { blobUrl } from "@orb/contracts/assets";
import type { PluginImageNode, PluginSurfaceNode } from "@orb/contracts/plugin";
import { PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { AssetId } from "@orb/kit/ids";
import { settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import type { PluginPresentationPageStory } from "../_ct-stories.tsx";

type ImageAspect = NonNullable<PluginImageNode["aspect"]>;
const PORTRAIT_RATIO = TOKENS["aspect.portrait"].value;
const PORTRAIT_SEPARATOR = PORTRAIT_RATIO.indexOf("/");
const RATIOS: Readonly<Record<ImageAspect, number>> = {
  landscape: 16 / 9,
  portrait: Number(PORTRAIT_RATIO.slice(0, PORTRAIT_SEPARATOR)) / Number(PORTRAIT_RATIO.slice(PORTRAIT_SEPARATOR + 1)),
  square: 1,
};
const ASPECTS = ["landscape", "portrait", "square"] as const satisfies readonly ImageAspect[];
const STATES = ["loaded", "missing", "broken"] as const;
type ImageState = (typeof STATES)[number];
interface ImageExpectation {
  readonly section: Locator;
  readonly aspect: ImageAspect | undefined;
  readonly state: ImageState | "intrinsic";
  readonly originalPath: string;
  readonly body: Locator;
}
const STORY = "tests/client/features/plugin/_ct-stories/PluginPresentationPageStory";
const REGIMES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, host: 900, touch: false },
  { name: "narrow phone", viewport: { width: 390, height: 844 }, host: 300, touch: true },
] as const;

function imageSpec(assetId: AssetId, state: ImageState, intrinsic: boolean): PluginSurfaceNode {
  const aspects = intrinsic ? [undefined] : ASPECTS;
  return {
    kind: "stack",
    children: aspects.map((aspect) => ({
      kind: "section",
      kicker: aspect ?? "Intrinsic",
      children: [
        {
          kind: "image",
          alt: `${aspect ?? "Intrinsic"} image`,
          ...(state === "missing" ? { assetFrom: { $state: "absent" } } : { assetId }),
          ...(aspect === undefined ? {} : { aspect }),
        },
      ],
    })),
  };
}

async function expectLoaded(image: Locator, path: string): Promise<number> {
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0)).toBe(true);
  const facts = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const source = new URL(element.currentSrc);
    return {
      path: source.pathname,
      query: source.search,
      fit: getComputedStyle(element).objectFit,
      naturalRatio: element.naturalWidth / element.naturalHeight,
    };
  });
  expect(facts.path).toBe(path);
  expect(facts.query).toBe("");
  expect(facts.fit).toBe("contain");
  return facts.naturalRatio;
}

async function expectImageAspect({ section, aspect, state, originalPath, body }: ImageExpectation): Promise<void> {
  const label = aspect ?? "Intrinsic";
  let media: Locator;
  let expectedRatio: number;
  if (state === "missing") {
    media = section.getByText(`${label} image`, { exact: true }).locator("..");
    expectedRatio = RATIOS[aspect ?? "square"];
  } else if (state === "broken") {
    await section.scrollIntoViewIfNeeded();
    media = section.getByText("Media unavailable", { exact: true });
    expectedRatio = RATIOS[aspect ?? "square"];
  } else {
    media = section.getByRole("img", { name: `${label} image`, exact: true });
    const naturalRatio = await expectLoaded(media, originalPath);
    expectedRatio = aspect === undefined ? naturalRatio : RATIOS[aspect];
  }
  await expect(media).toBeVisible();
  const box = await settledBox(media);
  const host = await settledBox(body);
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(Math.abs(box.width / box.height - expectedRatio)).toBeLessThan(0.02);
  expect(box.x).toBeGreaterThanOrEqual(host.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(host.x + host.width + 1);
  await section.screenshot({ path: test.info().outputPath(`plugin-image-${label}-${state}.png`) });
}

for (const regime of REGIMES) {
  test.describe(`Plugin image ratio ${regime.name}`, () => {
    test.use({ hasTouch: regime.touch, isMobile: regime.touch });

    for (const state of [...STATES, "intrinsic"] as const) {
      const imageState = state === "intrinsic" ? "loaded" : state;
      const intrinsic = state === "intrinsic";
      const aspects = intrinsic ? [undefined] : ASPECTS;
      test(`${state} media honors declared ratios without changing the original asset`, async ({ page, corpusMedia, mount }) => {
        await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
        const asset = (await caller.assets.listOwned({ kind: "gallery", limit: 1 }))[0];
        if (asset === undefined) {
          throw new Error("The committed corpus has no owned gallery image");
        }
        const spec = imageSpec(asset.assetId, imageState, intrinsic);
        const manifest = pluginManifestSchema.parse({
          id: "image-aspect",
          name: "Image aspect witness",
          description: "Declared image ratios over an owned original asset",
          version: "1.0.0",
          hostVersion: 1,
          entry: PLUGIN_MAIN_ENTRY,
          capabilities: ["ui.surface"],
        });
        const source = `const host=orb.host(1);host.ui.register({id:"image_page",anchor:"page",title:"Image aspect witness",tier:"static",spec:${JSON.stringify(spec)}});void host.ui.setState("image_page",{});`;
        const plugin = await caller.plugin.install({
          bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
          grant: [],
        });
        await caller.plugin.setGrant({ pluginId: plugin.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
        const address = { pluginId: plugin.id, surfaceId: "image_page" };
        await expect.poll(() => caller.plugin.getSurfaceState(address)).toEqual({});
        await routeTrpc(
          page,
          serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "plugin.list",
            "plugin.listSurfaces",
            "plugin.getSurfaceState",
            "plugin.listBundleAssets",
            "assets.resolveBlobRefs",
          ]),
        );
        await corpusMedia();
        const originalPath = blobUrl(asset.hash);
        if (state === "broken") {
          await page.route(`**${originalPath}`, (route) => route.fulfill({ status: 404, body: "Scripted blob transport failure" }));
        }
        await page.setViewportSize(regime.viewport);
        await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.host });
        const body = page.getByRole("group", { name: manifest.name, exact: true });
        for (const aspect of aspects) {
          const label = aspect ?? "Intrinsic";
          const section = body.getByText(label, { exact: true }).locator("..");
          await expectImageAspect({ section, aspect, state, originalPath, body });
        }
      });
    }
  });
}
