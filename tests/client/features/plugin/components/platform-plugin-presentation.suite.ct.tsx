import { spawn } from "node:child_process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import {
  PLUGIN_FRAME_ROUTE,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_ROUTE,
  pluginManifestSchema,
  resolvePluginBoundTiles,
} from "@orb/contracts/plugin";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness, makePluginBundle, requireShowcaseBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { strToU8 } from "fflate";
import { pluginDetailsLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import { PLUGIN_MODEL_HEADING } from "#client/features/plugin/lib/plugin-model-copy.ts";
import type { PluginPresentationPageStory } from "../_ct-stories.tsx";
import type { PluginConsentLayoutStory } from "./_consent-layout-stories.tsx";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

type PresentationRoot = Awaited<ReturnType<typeof createCorpusHarness>>;
type PresentationCaller = Awaited<ReturnType<PresentationRoot["internalCallerFor"]>>;

const PAGE_STORY = "tests/client/features/plugin/_ct-stories/PluginPresentationPageStory";
const SETTINGS_STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory";
const VIEWPORTS = [
  { width: 390, height: 844, host: 390, touch: true, mobile: true, sharedLine: false },
  { width: 844, height: 390, host: 844, touch: true, mobile: true, sharedLine: true },
  { width: 1440, height: 900, host: 300, touch: false, mobile: false, sharedLine: false },
];

test.use({ hasTouch: true, isMobile: true });

async function defaults(caller: PresentationCaller): Promise<void> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
}

async function enableShowcase(caller: PresentationCaller, slug: string): Promise<Awaited<ReturnType<PresentationCaller["plugin"]["setGrant"]>>> {
  const bundleBase64 = Buffer.from(await requireShowcaseBundle(slug)).toString("base64");
  const installed = (await caller.plugin.list()).find((candidate) => candidate.slug === slug);
  const plugin =
    installed === undefined ? await caller.plugin.install({ bundleBase64, grant: [] }) : await caller.plugin.upgrade({ pluginId: installed.id, bundleBase64 });
  return await caller.plugin.setGrant({
    pluginId: plugin.id,
    grant: [...plugin.declaredCapabilities],
    acknowledgedNetHosts: [...(plugin.netHosts ?? [])],
    enable: true,
  });
}

async function routePluginReads(page: Page, caller: PresentationCaller): Promise<void> {
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
      "plugin.invokeUiAction",
      "plugin.listDistributed",
      "connection.listBindings",
      "connection.list",
      "plugin.getLog",
      "plugin.checkForUpdates",
      "plugin.uiHostCall",
      "plugin.reportUiCrash",
    ]),
  );
}

async function expectContained(control: Pick<Locator, "boundingBox">, host: Pick<Locator, "boundingBox">): Promise<void> {
  const [box, region] = await Promise.all([control.boundingBox(), host.boundingBox()]);
  if (box === null || region === null) {
    throw new Error("Plugin containment needs rendered control and host boxes");
  }
  expect(box.x).toBeGreaterThanOrEqual(region.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(region.x + region.width + 1);
}

async function expectWholeRowContained(page: Page, controls: readonly Locator[], host: Locator): Promise<void> {
  const elements = await Promise.all(controls.map((control) => control.elementHandle()));
  try {
    const ancestor = await page.evaluateHandle((nodes) => {
      const first = nodes[0];
      if (first === undefined) {
        throw new Error("The measured row has no first control");
      }
      let parent = first.parentElement;
      while (parent !== null) {
        const candidate = parent;
        if (nodes.every((node) => candidate.contains(node))) {
          return candidate;
        }
        parent = candidate.parentElement;
      }
      throw new Error("The measured controls have no shared row ancestor");
    }, elements);
    try {
      const row = ancestor.asElement();
      for (const control of controls) {
        await expectContained(control, row);
      }
      await expectContained(row, host);
    } finally {
      await ancestor.dispose();
    }
  } finally {
    await Promise.all(elements.map((element) => element.dispose()));
  }
}

async function expectSameLine(first: Locator, second: Locator): Promise<void> {
  const [left, right] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (left === null || right === null) {
    throw new Error("Same-line measurement needs both rendered controls");
  }
  expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
}

const atlasWire: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.method !== "GET") {
    throw new Error(`Unexpected Atlas external request: ${request.method} ${url}`);
  }
  if (url.hostname === "character-tavern.com" && url.pathname === "/api/search/cards") {
    const page = url.searchParams.get("page") ?? "1";
    return Promise.resolve(
      Response.json({
        hits: [{ path: `witness/card-${page}`, name: `Witness card ${page}`, author: "Witness", tagline: "A remote search result." }],
        totalPages: 2,
      }),
    );
  }
  if (url.hostname === "character-tavern.com" && url.pathname.startsWith("/api/character/witness/")) {
    return Promise.resolve(Response.json({ card: { description: "The remote card's detailed description." } }));
  }
  if (url.hostname === "ct-cards.storage.character-tavern.com") {
    return Promise.resolve(new Response("No cover in this external fixture", { status: 404 }));
  }
  throw new Error(`Unscripted Atlas external request: ${url}`);
};

for (const viewport of VIEWPORTS) {
  test.describe(`Atlas regime ${viewport.width}`, () => {
    test.use({ hasTouch: viewport.touch, isMobile: viewport.mobile });
    test(`Atlas whole filter controls ${viewport.sharedLine ? "stay inline and horizontally contained" : "stay horizontally contained"} in a ${viewport.host}px host at ${viewport.width}×${viewport.height}`, async ({
      page,
      mount,
    }) => {
      await using root = await createCorpusHarness(undefined, {
        pluginSpawn: spawn,
        networkExecution: { fetch: atlasWire, resolver: () => Promise.resolve(["93.184.215.14"]) },
      });
      const caller = await root.internalCallerFor(root.ownerId);
      await defaults(caller);
      const atlas = await enableShowcase(caller, "card-atlas");
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await routePluginReads(page, caller);
      await mount<typeof PluginPresentationPageStory>(PAGE_STORY, { pluginId: atlas.id, surfaceId: "atlas_page", width: viewport.host });
      const body = page.getByRole("group", { name: "Card Atlas", exact: true });
      const hub = body.getByRole("combobox", { name: "Hub", exact: true });
      const sort = body.getByRole("combobox", { name: "Sort", exact: true });
      const sfw = body.getByRole("switch", { name: "SFW only", exact: true });
      await expect(hub).toBeVisible();
      await expect(sort).toBeVisible();
      await expect(sfw).toBeVisible();
      for (const control of [hub, sort, sfw]) {
        await expectContained(control, body);
      }
      await expectWholeRowContained(page, [hub, sort, sfw], body);
      if (viewport.sharedLine) {
        await expectSameLine(hub, sort);
      }
      await hub.click();
      await expect(page.getByRole("option", { name: "Character Tavern", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.screenshot({ path: test.info().outputPath("atlas-filters.png") });
    });

    test(`Atlas shipped pager, text and action rows remain usable in a ${viewport.host}px host`, async ({ page, mount }) => {
      await using root = await createCorpusHarness(undefined, {
        pluginSpawn: spawn,
        networkExecution: { fetch: atlasWire, resolver: () => Promise.resolve(["93.184.215.14"]) },
      });
      const caller = await root.internalCallerFor(root.ownerId);
      await defaults(caller);
      const atlas = await enableShowcase(caller, "card-atlas");
      const address = { pluginId: atlas.id, surfaceId: "atlas_page" };
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ stage: "browse", loading: false });
      await caller.plugin.invokeUiAction({ ...address, actionId: "search", values: { q: "witness" } });
      await expect
        .poll(() => caller.plugin.getSurfaceState(address))
        .toMatchObject({
          loading: false,
          tiles: expect.arrayContaining([expect.objectContaining({ title: "Witness card 1" })]),
        });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await routePluginReads(page, caller);
      const component = await mount<typeof PluginPresentationPageStory>(PAGE_STORY, { ...address, width: viewport.host });
      const body = page.getByRole("group", { name: "Card Atlas", exact: true });
      const previous = body.getByRole("button", { name: "Previous", exact: true });
      const next = body.getByRole("button", { name: "Next", exact: true });
      const status = body.getByText("Page 1 of 2", { exact: true });
      await expect(previous).toBeEnabled();
      await expect(next).toBeEnabled();
      await expect(status).toBeVisible();
      await expectWholeRowContained(page, [previous, status, next], body);
      await previous.click();
      await expect(body.getByText("Already on the first page.", { exact: true })).toBeVisible();
      await component.unmount();
      const published = await caller.plugin.getSurfaceState(address);
      if (published === null) {
        throw new Error("The real Atlas search published no state");
      }
      const tile = resolvePluginBoundTiles(published, { $state: "tiles" })[0];
      if (tile === undefined) {
        throw new Error("The real Atlas search published no tile to open");
      }
      await caller.plugin.invokeUiAction({ ...address, actionId: "open_result", values: { tile: tile.id } });
      await expect
        .poll(() => caller.plugin.getSurfaceState(address))
        .toMatchObject({
          stage: "card",
          detail: { blurb: "The remote card's detailed description." },
        });
      await mount<typeof PluginPresentationPageStory>(PAGE_STORY, { ...address, width: viewport.host });
      const detail = page.getByRole("group", { name: "Card Atlas", exact: true });
      const back = detail.getByRole("button", { name: "Back to results", exact: true });
      const add = detail.getByRole("button", { name: "Add to library", exact: true });
      await expect(back).toBeVisible();
      await expect(add).toBeVisible();
      await expectContained(back, detail);
      await expectContained(add, detail);
      await expect(detail.getByText("The remote card's detailed description.", { exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("atlas-detail.png") });
      await back.click();
      await expect(detail.getByRole("button", { name: "Witness card 1, Witness", exact: true })).toBeVisible();
      await expect(detail.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
      await expect(detail.getByText("Page 1 of 2", { exact: true })).toBeVisible();
      await expect(detail.getByText("The remote card's detailed description.", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("atlas-rows.png") });
    });
  });
}

for (const { width, touch, mobile } of [
  { width: 390, touch: true, mobile: true },
  { width: 1000, touch: false, mobile: false },
]) {
  test.describe(`Installed settings regime ${width}`, () => {
    test.use({ hasTouch: touch, isMobile: mobile });
    test(`settled plugin details preserve settings attribution and management at ${width}`, async ({ page, mount }) => {
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
      const caller = await root.internalCallerFor(root.ownerId);
      await defaults(caller);
      const research = await enableShowcase(caller, "research-familiar");
      const affinity = await enableShowcase(caller, "affinity-tracker");
      await page.setViewportSize({ width, height: 844 });
      await routePluginReads(page, caller);
      await mount<typeof PluginConsentLayoutStory>(SETTINGS_STORY, { width });
      for (const plugin of [research, affinity]) {
        const row = page.getByRole("group", { name: `${plugin.name} plugin`, exact: true });
        await expect(row.getByRole("switch", { name: `Turn ${plugin.name} off`, exact: true })).toBeVisible();
        const details = row.getByRole("button", { name: pluginDetailsLabel(plugin.name), exact: true });
        await expect(details).toHaveAttribute("aria-expanded", "false");
        await details.click();
        await row.getByRole("button", { name: `What it's allowed to do — ${plugin.name}`, exact: true }).click();
        await expect(row.getByRole("group", { name: `What it's allowed to do — ${plugin.name}`, exact: true })).toBeVisible();
        const activity = row.getByRole("button", { name: `Recent activity for ${plugin.name}`, exact: true });
        await activity.click();
        await expect(activity.locator("..").getByRole("log", { name: "Log entries", exact: true })).toBeVisible();
        await expect(row.getByRole("button", { name: `More actions for ${plugin.name}`, exact: true })).toBeVisible();
        const update = row.getByRole("button", { name: `Check ${plugin.name} for updates`, exact: true });
        await expect(update).toHaveCount(plugin.updateSource === null ? 0 : 1);
      }
      const affinityRow = page.getByRole("group", { name: `${affinity.name} plugin`, exact: true });
      await affinityRow.getByRole("button", { name: `${PLUGIN_MODEL_HEADING} — ${affinity.name}`, exact: true }).click();
      await expect(affinityRow.getByRole("combobox", { name: `Text requests model for ${affinity.name}`, exact: true })).toBeVisible();
      for (const name of ["Research Familiar — Research destination", "Affinity Tracker — Affinity readings"]) {
        const surface = page.getByRole("group", { name, exact: true });
        await expect(surface).toBeVisible();
        expect(await surface.evaluate((element) => element.closest('[data-slot="card-root"]')?.getAttribute("aria-label"))).toMatch(/ plugin$/u);
        await expect(surface.locator("..").getByText(name.split(" — ")[0] ?? "", { exact: true })).toBeVisible();
      }
      await page.screenshot({ path: test.info().outputPath("plugin-settings.png") });
    });
  });
}

test("settings use the same attributed block for native scripted and frame registrations", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  await defaults(caller);
  const manifest = pluginManifestSchema.parse({
    id: "settings-tiers",
    name: "Settings tier witness",
    description: "Native registrations for settings presentation.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    uiEntry: PLUGIN_UI_ENTRY,
    capabilities: ["ui.surface", "ui.frame"],
  });
  const source =
    'const host=orb.host(1);host.ui.register({id:"scripted",anchor:"settings",title:"Scripted preferences",tier:"scripted"});host.ui.registerFrame({id:"frame",anchor:"settings",title:"Frame preferences",html:"<p>Native frame settings</p>"});';
  const ui = 'orb.ui(1).render("scripted",{kind:"text",value:"Native scripted settings"});';
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8(ui) })).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  const identity = await root.principalFor(root.ownerId);
  const auth = await captureCookieAuth(root, identity, "settings-tier-native-password");
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
  await routePluginReads(page, caller);
  const component = await mount<typeof PluginConsentLayoutStory>(SETTINGS_STORY, { width: 390 });
  let frameUrl: string | null = null;
  try {
    await expect(page.getByText("Native scripted settings", { exact: true })).toBeVisible();
    const frame = page.locator('iframe[title="Settings tier witness — Frame preferences"]');
    await frame.scrollIntoViewIfNeeded();
    frameUrl = await frame.getAttribute("src");
    await expect(
      page.frameLocator('iframe[title="Settings tier witness — Frame preferences"]').getByText("Native frame settings", { exact: true }),
    ).toBeVisible();
    for (const title of ["Scripted preferences", "Frame preferences"]) {
      const surface = page.getByRole("group", { name: `${plugin.name} — ${title}`, exact: true });
      await expect(surface).toBeVisible();
      expect(await surface.evaluate((element) => element.closest('[data-slot="card-root"]')?.getAttribute("aria-label"))).toBe(`${plugin.name} plugin`);
    }
  } finally {
    if (frameUrl === null) {
      await component.unmount();
    } else {
      const url = new URL(frameUrl, page.url()).href;
      const revoked = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url() === url);
      await component.unmount();
      await revoked;
    }
  }
});

test("Keepsake Album names the live media placement and retains its chat-only slash alternative", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  await defaults(caller);
  const camera = await enableShowcase(caller, "keepsake-camera");
  const snapshot = (await caller.plugin.listCommands()).find((command) => command.pluginId === camera.id && command.name === "snapshot");
  expect(snapshot?.placements).toContainEqual(expect.objectContaining({ target: "composer-media", label: "Snapshot" }));
  await routePluginReads(page, caller);
  await mount<typeof PluginPresentationPageStory>(PAGE_STORY, { pluginId: camera.id, surfaceId: "album_page", width: 390 });
  const album = page.getByRole("group", { name: "Keepsake Camera — The Album", exact: true });
  await expect(album).toContainText("Message tools → Keepsake Camera → Snapshot");
  await expect(album).toContainText("/plugin keepsake-camera snapshot");
  await expect(album).toContainText("The album cannot take a picture outside a chat.");
});

test("Keepsake Snapshot stays reachable in its attributed media menu without generating a picture", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  await defaults(caller);
  const camera = await enableShowcase(caller, "keepsake-camera");
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room for the registered media menu");
  }
  await seedShellState(page, { activeSection: "chats" });
  const routes = await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "plugin.listCommands", "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  await page.getByRole("button", { name: "Message tools", exact: true }).click();
  const snapshot = page.getByRole("menuitem", { name: `${camera.name} · Commands · Snapshot`, exact: true });
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toBeEnabled();
  expect(routes.count("plugin.invokeUiCommand")).toBe(0);
  await page.keyboard.press("Escape");
  await expect(snapshot).toHaveCount(0);
});
