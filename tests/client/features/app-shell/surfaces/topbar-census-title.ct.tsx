// The phone topbar's screen name beside a roster's census: the name stays whole and the census is what the row cuts, at the
// phone widths the row is laid out for and at enlarged text. "Plugin pages" is the longest section name that carries a census.
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const PHONE_WIDTHS = [360, 390, 430] as const;
// Enlarged text is what puts the longest name and its census at odds on a phone row; how much each width takes differs.
const TEXT_LADDER = [1, 1.25, 1.5, 2, 2.5, 3] as const;
const PAGES = 1040;
const NOTHING_MATCHES = "no page has this name";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The Extensions section with `PAGES` registered plugin pages, served through the production shell. */
async function routePluginPages(page: Page, corpus: CorpusPlayback): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const viewer = await caller.sessions.me();
  const plugin = makePluginRow({ slug: "oracle-deck", name: "Oracle Deck" });
  const surfaces: TrpcWireOutput<"plugin.listSurfaces"> = Array.from({ length: PAGES }, (_unused, index) => ({
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

test.use({ hasTouch: true });

for (const width of PHONE_WIDTHS) {
  test(`at ${String(width)} the longest section name stays whole while the census is what the row cuts`, async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width, height: 844 });
    await routePluginPages(page, corpus);
    await mount<typeof AppShellStory>(STORY, {});
    await page.getByLabel("Search plugin pages").fill(NOTHING_MATCHES);
    const title = page.locator(TITLE);
    const name = title.locator(".shell-topbar-title-name");
    const census = title.locator(".shell-topbar-title-census");
    await expect(title).toContainText(`${SECTION_LABELS.extensions} · 0 of ${String(PAGES)}`);
    // The positive control: grow the text until the row is short of room, so the census really is cut.
    let step = 0;
    await expect
      .poll(async () => {
        await setRootFontScale(page, channelName("fontScale"), TEXT_LADDER[Math.min(step, TEXT_LADDER.length - 1)] ?? null);
        step += 1;
        return census.evaluate((element) => element.scrollWidth > element.clientWidth);
      })
      .toBe(true);
    // The name is the title's floor, so what the row cut is the census and the name is whole.
    await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}
