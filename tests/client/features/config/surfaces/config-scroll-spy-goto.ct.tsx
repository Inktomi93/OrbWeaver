// @subject packages/client/src/features/config/hooks/use-config-scroll-spy.ts
// An explicit goto holds the lit section when the target cannot reach the pane's top; only the reader's own scroll hands the highlight back to the spy.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigSpyStory } from "./_spy-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_spy-stories/ConfigSpyStory";
/** Content this much taller than the pane leaves a tail too short to scroll the target to the top. */
const SHORT_TAIL_PX = 90;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a goto to a section above a short tail keeps that section lit", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "settings.listThemes",
      "workloads.list",
      "workloads.listSchedules",
      "connection.listBindings",
      "connection.list",
      "admin.listUsers",
    ]),
  );
  const component = await mount<typeof ConfigSpyStory>(STORY, { height: 3000 });
  const scroller = page.locator('[data-slot="config-content"]');
  const probe = page.locator('[data-probe="active-sub"]');
  const target = await probe.getAttribute("data-target");
  await expect(page.locator('[data-slot="config-content"] [id]').first()).toBeAttached();
  const contentHeight = await scroller.evaluate((node) => node.scrollHeight);
  await component.update({ height: contentHeight - SHORT_TAIL_PX });
  await page.getByRole("button", { name: "Jump to schedules", exact: true }).click();
  await expect(probe).toHaveText(target ?? "");
  // The spy's later ticks (a body settling, a resize) must not replace the named section: provoke both and let two frames pass.
  await scroller.evaluate(async (node) => {
    node.appendChild(node.ownerDocument.createElement("div"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await component.update({ height: contentHeight - SHORT_TAIL_PX - 1 });
  await expect(probe).toHaveText(target ?? "");
  // The hold ends with the reader's own scroll: back at the top, the spy lights the first section again.
  await scroller.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(probe).not.toHaveText(target ?? "");
});
