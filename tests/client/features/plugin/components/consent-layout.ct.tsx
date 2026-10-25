import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { approveLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginConsentLayoutStory } from "./_consent-layout-stories.tsx";

const PIXEL_TOLERANCE = 1;

async function actionOverflow(notice: Locator, approve: Locator, remove: Locator, width: number): Promise<number> {
  const [box, first, second] = await Promise.all([notice.boundingBox(), approve.boundingBox(), remove.boundingBox()]);
  if (box === null || first === null || second === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(
    0,
    -box.x,
    box.x + box.width - width,
    box.x - first.x,
    first.x + first.width - box.x - box.width,
    box.x - second.x,
    second.x + second.width - box.x - box.width,
  );
}

test.use({ hasTouch: true });

for (const width of [390, 900]) {
  test(`pending plugin actions fit their notice and retain keyboard focus at ${width}`, async ({ page, mount }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const pending = (await caller.plugin.list()).filter((plugin) => plugin.reconsentPending);
    const first = pending[0];
    if (first === undefined) {
      throw new Error("The corpus has no pending plugin consent");
    }
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "plugin.list",
        "plugin.listSurfaces",
        "plugin.listDistributed",
        "connection.listBindings",
      ]),
    );
    await mount<typeof PluginConsentLayoutStory>("tests/client/features/plugin/components/_consent-layout-stories/PluginConsentLayoutStory", { width });
    for (const plugin of pending) {
      const approve = page.getByRole("button", { name: approveLabel(plugin.name, plugin.declaredCapabilities.length), exact: true });
      await expect(approve).toBeVisible();
      const actions = approve.locator("..");
      const notice = actions.locator("..");
      const remove = actions.getByRole("button").nth(1);
      await expect(remove).toContainText(plugin.name);
      await testInfo.attach(`consent-overflow-${plugin.slug}`, {
        body: JSON.stringify({ width, overflow: await actionOverflow(notice, approve, remove, width) }),
        contentType: "application/json",
      });
      await expect.poll(() => actionOverflow(notice, approve, remove, width)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    }
    const approve = page.getByRole("button", { name: approveLabel(first.name, first.declaredCapabilities.length), exact: true });
    const remove = approve.locator("..").getByRole("button").nth(1);
    await approve.focus();
    await page.keyboard.press("Tab");
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
  });
}
