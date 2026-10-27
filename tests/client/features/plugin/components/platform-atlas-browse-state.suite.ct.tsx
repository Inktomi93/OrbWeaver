// These cases render the installed guest's publications, not a reconstructed Atlas view. Remounts read
// settled server state; continuous cross-device socket delivery and HTTP authentication are separate proofs.
import { spawn } from "node:child_process";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PluginId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, requireShowcaseBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { PluginPresentationPageStory } from "../_ct-stories.tsx";

type AtlasRoot = Awaited<ReturnType<typeof createCorpusHarness>>;
type AtlasCaller = Awaited<ReturnType<AtlasRoot["internalCallerFor"]>>;
type AtlasAddress = Omit<Parameters<AtlasCaller["plugin"]["getSurfaceState"]>[0], "pluginId"> & { readonly pluginId: PluginId };

interface ExternalAtlasSearch {
  readonly execution: NonNullable<NonNullable<Parameters<typeof createCorpusHarness>[1]>["networkExecution"]>;
  readonly requested: Promise<void>;
  readonly refuse: () => void;
  readonly queries: readonly string[];
}

const STORY = "tests/client/features/plugin/_ct-stories/PluginPresentationPageStory";
const PRISTINE = "Search to begin — the atlas covers nine community hubs.";
const FAILURE = "Character Tavern didn't answer — try again in a moment.";
const EMPTY = 'Nothing from Character Tavern for "lantern" with fantasy. Try another search or adjust the filters.';
const REGIMES = [
  { name: "desktop", width: 1000, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

/** Only community search is scripted. No art, imports, provider calls or widened network admission. */
function externalSearch(): ExternalAtlasSearch {
  const held = Promise.withResolvers<Response>();
  const requested = Promise.withResolvers<void>();
  const queries: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method !== "GET" || url.hostname !== "character-tavern.com" || url.pathname !== "/api/search/cards") {
      throw new Error(`Unscripted Atlas request: ${request.method} ${url}`);
    }
    const query = url.searchParams.get("query") ?? "";
    queries.push(query);
    if (query === "stale" || (query === "lantern" && queries.length === 1)) {
      requested.resolve();
      return await held.promise;
    }
    return searchResponse(url, query);
  };
  return {
    execution: {
      fetch,
      resolver: (hostname: string): Promise<string[]> =>
        hostname === "character-tavern.com" ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`Unscripted Atlas hostname: ${hostname}`)),
    },
    requested: requested.promise,
    refuse: (): void => held.resolve(new Response("Scripted community refusal", { status: 503 })),
    queries,
  };
}

function searchResponse(url: URL, query: string): Response {
  if (query === "missing") {
    return new Response("Scripted community refusal", { status: 503 });
  }
  if (query === "lantern") {
    return Response.json({ hits: [], totalPages: 1 });
  }
  if (query === "found" || query === "latest") {
    const page = url.searchParams.get("page") ?? "1";
    return Response.json({
      hits: [{ path: `witness/card-${page}`, name: query === "latest" ? "Latest card" : `Witness card ${page}`, author: "Witness" }],
      totalPages: 2,
    });
  }
  throw new Error(`Unscripted Atlas query: ${query}`);
}

async function enableAtlas(caller: AtlasCaller): Promise<AtlasAddress> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const bundleBase64 = Buffer.from(await requireShowcaseBundle("card-atlas")).toString("base64");
  const installed = (await caller.plugin.list()).find((candidate) => candidate.slug === "card-atlas");
  const plugin =
    installed === undefined ? await caller.plugin.install({ bundleBase64, grant: [] }) : await caller.plugin.upgrade({ pluginId: installed.id, bundleBase64 });
  await caller.plugin.setGrant({
    pluginId: plugin.id,
    grant: ["storage.kv", "ui.surface", "net.fetch"],
    acknowledgedNetHosts: [...(plugin.netHosts ?? [])],
    enable: true,
  });
  const address = { pluginId: plugin.id, surfaceId: "atlas_page" };
  await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ stage: "browse", loading: false });
  return address;
}

async function routeAtlas(page: Page, caller: AtlasCaller): Promise<void> {
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
    ]),
  );
}

async function expectGuidance(body: Locator, copy: string): Promise<void> {
  const line = body.getByText(copy, { exact: true });
  await expect(line).toBeVisible();
  const [host, text] = await Promise.all([body.boundingBox(), line.boundingBox()]);
  if (host === null || text === null) {
    throw new Error("Atlas guidance needs painted host and copy boxes");
  }
  expect(text.x).toBeGreaterThanOrEqual(host.x - 1);
  expect(text.x + text.width).toBeLessThanOrEqual(host.x + host.width + 1);
}

for (const regime of REGIMES) {
  test.describe(`Atlas browse guidance ${regime.name}`, () => {
    test.use({ hasTouch: regime.touch, isMobile: regime.touch });

    test("a completed failure does not claim pristine, and ordinary Search retries to a specific empty result", async ({ page, mount }) => {
      const wire = externalSearch();
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn, networkExecution: wire.execution });
      const caller = await root.internalCallerFor(root.ownerId);
      const address = await enableAtlas(caller);
      await page.setViewportSize({ width: regime.width, height: regime.height });
      await routeAtlas(page, caller);
      let component = await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      const body = page.getByRole("group", { name: "Card Atlas", exact: true });
      await expectGuidance(body, PRISTINE);
      await expect(body.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
      await body.getByRole("textbox", { name: "Search the community hubs", exact: true }).fill("lantern");
      try {
        await body.getByRole("button", { name: "Search", exact: true }).click();
        await wire.requested;
        await expectGuidance(body, 'Searching Character Tavern for "lantern"…');
        await expect(body.getByText(PRISTINE, { exact: true })).toHaveCount(0);
        await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: true, noSearch: true });
      } finally {
        wire.refuse();
      }
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, noSearch: true, status: FAILURE, tiles: [] });
      await component.unmount();
      component = await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      await expectGuidance(body, FAILURE);
      await expect(body.getByText(PRISTINE, { exact: true })).toHaveCount(0);
      await expectGuidance(body, "No cards to show.");
      await expect(body.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
      await page.screenshot({ path: test.info().outputPath("atlas-failed.png") });

      await body.getByRole("textbox", { name: "Search the community hubs", exact: true }).fill("lantern");
      await body.getByRole("button", { name: "Tag filters", exact: true }).click();
      await body.getByRole("textbox", { name: "Include tags", exact: true }).fill("fantasy");
      await body.getByRole("button", { name: "Search", exact: true }).click();
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, noSearch: false, tiles: [] });
      await component.unmount();
      await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      await expectGuidance(body, EMPTY);
      await expectGuidance(body, "No cards to show.");
      await expect(body.getByText(FAILURE, { exact: true })).toHaveCount(0);
      await expect(body.getByText(PRISTINE, { exact: true })).toHaveCount(0);
      expect(wire.queries).toEqual(["lantern", "lantern"]);
      await page.screenshot({ path: test.info().outputPath("atlas-empty-retry.png") });
    });

    test("a failed replacement search retains real populated results and pages the executed search", async ({ page, mount }) => {
      const wire = externalSearch();
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn, networkExecution: wire.execution });
      const caller = await root.internalCallerFor(root.ownerId);
      const address = await enableAtlas(caller);
      await caller.plugin.invokeUiAction({ ...address, actionId: "search", values: { q: "found" } });
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, status: '1 from Character Tavern for "found".' });
      await caller.plugin.invokeUiAction({ ...address, actionId: "search", values: { q: "missing" } });
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, status: FAILURE });
      await page.setViewportSize({ width: regime.width, height: regime.height });
      await routeAtlas(page, caller);
      const component = await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      const body = page.getByRole("group", { name: "Card Atlas", exact: true });
      await expectGuidance(body, FAILURE);
      await expect(body.getByText("Witness card 1", { exact: true })).toBeVisible();
      await expect(body.getByText("Page 1 of 2", { exact: true })).toBeVisible();
      await expect(body.getByText("No cards to show.", { exact: true })).toHaveCount(0);
      await expect(body.getByText(PRISTINE, { exact: true })).toHaveCount(0);
      await body.getByRole("button", { name: "Next", exact: true }).click();
      await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, pageLabel: "Page 2 of 2" });
      await component.unmount();
      await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      await expectGuidance(body, '1 from Character Tavern for "found".');
      await expect(body.getByText("Witness card 2", { exact: true })).toBeVisible();
      expect(wire.queries).toEqual(["found", "missing", "found"]);
    });

    test("a superseded failed continuation cannot replace newer populated guidance", async ({ page, mount }) => {
      const wire = externalSearch();
      await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn, networkExecution: wire.execution });
      const caller = await root.internalCallerFor(root.ownerId);
      const address = await enableAtlas(caller);
      try {
        await caller.plugin.invokeUiAction({ ...address, actionId: "search", values: { q: "stale" } });
        await wire.requested;
        await caller.plugin.invokeUiAction({ ...address, actionId: "search", values: { q: "latest" } });
        await expect.poll(() => caller.plugin.getSurfaceState(address)).toMatchObject({ loading: false, status: '1 from Character Tavern for "latest".' });
      } finally {
        wire.refuse();
      }
      await expect
        .poll(async () => (await caller.plugin.getLog({ pluginId: address.pluginId })).some(({ message }) => message.includes("fetch 503:")))
        .toBe(true);
      await page.setViewportSize({ width: regime.width, height: regime.height });
      await routeAtlas(page, caller);
      await mount<typeof PluginPresentationPageStory>(STORY, { ...address, width: regime.width });
      const body = page.getByRole("group", { name: "Card Atlas", exact: true });
      await expectGuidance(body, '1 from Character Tavern for "latest".');
      await expect(body.getByText("Latest card", { exact: true })).toBeVisible();
      await expect(body.getByText(FAILURE, { exact: true })).toHaveCount(0);
      await expect(body.getByText(PRISTINE, { exact: true })).toHaveCount(0);
      expect(wire.queries).toEqual(["stale", "latest"]);
    });
  });
}
