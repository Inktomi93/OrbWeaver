// No failure is silent: an older write that fails after a newer one, or after the error was cleared, still toasts.
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { SupersededWritesStory } from "./_superseded-writes-stories.tsx";

const STORY = "tests/client/data/_superseded-writes-stories/SupersededWritesStory";
const SAVE_FAILED = "Couldn't save the setting.";

test("a write that fails after a newer write succeeded is still said", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["settings.updateAppSettings"], (input) => (input.partial.promptCacheMinDepth === 1 ? hold : undefined)),
  });
  await mount<typeof SupersededWritesStory>(STORY, {});

  await page.getByRole("button", { name: "Write first", exact: true }).click();
  await hold.requested;
  await page.getByRole("button", { name: "Write second", exact: true }).click();
  await expect(page.getByRole("status", { name: "Second write", exact: true })).toHaveText("Saved");
  hold.fail();
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert", { name: SAVE_FAILED, exact: true })).toHaveCount(1);
});

test("a write whose error was cleared before it failed is still said", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["settings.updateAppSettings"], (input) => (input.partial.promptCacheMinDepth === 1 ? hold : undefined)),
  });
  await mount<typeof SupersededWritesStory>(STORY, {});

  await page.getByRole("button", { name: "Write first", exact: true }).click();
  await hold.requested;
  await page.getByRole("button", { name: "Clear error", exact: true }).click();
  hold.fail();
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert", { name: SAVE_FAILED, exact: true })).toHaveCount(1);
});
