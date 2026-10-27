import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { HomeGridRefStory } from "./_grid-ref-stories.tsx";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.use({ hasTouch: true, isMobile: true, viewport: { width: 1680, height: 1000 } });
test.beforeAll(async () => {
  root = await createCorpusHarness();
});
test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("Home passes its grid ref to quick-picks across the coarse-pointer column change", async ({ corpus, mount, page }) => {
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES),
  });
  const mounted = await mount<typeof HomeGridRefStory>("tests/client/features/home/surfaces/_grid-ref-stories/HomeGridRefStory", { width: 1440 });
  const faces = page.getByRole("list", { name: "Character quick-picks", exact: true });
  const shelf = faces.locator("..");
  await expect(faces).toBeVisible();
  await expect.poll(() => page.locator("[data-home-grid]").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/u).length)).toBe(2);
  await expect(shelf).toHaveCSS("grid-auto-flow", "row");
  await mounted.update({ width: 500 });
  await expect(shelf).toHaveCSS("grid-auto-flow", "column");
  await expect(faces.getByRole("button").first()).toBeVisible();
  await mounted.update({ width: 1440 });
  await expect(shelf).toHaveCSS("grid-auto-flow", "row");
});
