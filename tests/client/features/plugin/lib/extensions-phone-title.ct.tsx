// @subject packages/client/src/features/plugin/lib/use-extensions-selection-title.ts
// @subject packages/client/src/lib/census-title.ts
// The phone screen name of the production Plugin pages section: the page census with the section noun, the section
// noun alone while no page is registered, and the filtered `0 of N`.
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import type { Page } from "@playwright/test";
import { EXTENSIONS_SECTION_LABEL } from "#client/features/plugin/lib/extensions-section-label.ts";
import type { AppShellStory } from "../../app-shell/surfaces/_app-shell-stories.tsx";
import { SHELL_STORIES } from "../../app-shell/surfaces/app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const NARROW_TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const FINDER = "Search plugin pages";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type SurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

async function routeSection(page: Page, corpus: CorpusPlayback, pages: number): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const viewer = await caller.sessions.me();
  const plugin = makePluginRow({ slug: "oracle-deck", name: "Oracle Deck" });
  const surfaces: SurfaceRow[] = Array.from({ length: pages }, (_unused, index) => ({
    pluginId: plugin.id,
    id: `deck_page_${String(index)}`,
    anchor: "page",
    title: `Deck ${String(index)}`,
    tier: "static",
  }));
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, viewer.userId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => surfaces,
  });
  await seedShellState(page, { activeSection: "extensions" });
}

test("the phone screen name carries the registered page count beside the section noun", async ({ corpus, mount, page }) => {
  await routeSection(page, corpus, 2);
  await mount<typeof AppShellStory>(STORY, {});
  await expect(page.locator(NARROW_TITLE)).toHaveText(`${EXTENSIONS_SECTION_LABEL} · 2`);
});

test("with no page registered the screen name is the bare section noun", async ({ corpus, mount, page }) => {
  await routeSection(page, corpus, 0);
  await mount<typeof AppShellStory>(STORY, {});
  await expect(page.locator(NARROW_TITLE)).toHaveText(EXTENSIONS_SECTION_LABEL);
});

test("a finder that matches nothing keeps the library total in the screen name", async ({ corpus, mount, page }) => {
  await routeSection(page, corpus, 3);
  await mount<typeof AppShellStory>(STORY, {});
  const title = page.locator(NARROW_TITLE);
  await expect(title).toHaveText(`${EXTENSIONS_SECTION_LABEL} · 3`);
  await page.getByLabel(FINDER).fill("no page has this name");
  await expect(title).toHaveText(`${EXTENSIONS_SECTION_LABEL} · 0 of 3`);
});
