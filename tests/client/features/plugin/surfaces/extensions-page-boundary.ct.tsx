// @subject packages/client/src/features/plugin/surfaces/extensions-page-surface.tsx
// The Extensions pane reads the picked page through the shared boundary: a held read shows the loading status, a failed one the
// shared error block, and Retry resolves the pick (here a page no plugin registers, so the gone state).

import { testId } from "@orb/client/lib";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { EXTENSIONS_GONE_TITLE, EXTENSIONS_PAGE_LOADING_NAME, PLUGIN_PAGE_READ_LABEL } from "#client/features/plugin/lib/extensions-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ExtensionsPagePickStory, ExtensionsPageStory } from "./_extensions-page-stories.tsx";

const STORY = "tests/client/features/plugin/surfaces/_extensions-page-stories/ExtensionsPageStory";
const PICK_STORY = "tests/client/features/plugin/surfaces/_extensions-page-stories/ExtensionsPagePickStory";
const READS = ["sessions.me", "settings.getUserSettings", "plugin.list"] as const;

test("a held page read shows the loading status, a failed one the error block, and Retry resolves the pick", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let phase: "hold" | "fail" | "serve" = "hold";
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["plugin.listSurfaces"], () => {
      if (phase === "hold") {
        phase = "fail";
        return hold;
      }
      return phase === "fail" ? trpcError({ code: "BAD_REQUEST" }) : undefined;
    }),
  });
  await mount<typeof ExtensionsPageStory>(STORY, { pluginId: mintTypeId(ID_PREFIX.plugin, createSeededIds().next), surfaceId: "missing_page" });
  await hold.requested;
  await expect(page.getByText(EXTENSIONS_PAGE_LOADING_NAME, { exact: true })).toBeVisible();
  hold.fail();
  await expect(page.getByText(queryFailedLabel(PLUGIN_PAGE_READ_LABEL), { exact: true })).toBeVisible();
  phase = "serve";
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(PLUGIN_PAGE_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: EXTENSIONS_GONE_TITLE, exact: true })).toBeVisible();
});

test("a pane opened from a focused control keeps its mount focus when the held read lands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...serveCorpusProcedures(caller, ["plugin.listSurfaces"], () => hold) });
  await mount<typeof ExtensionsPagePickStory>(PICK_STORY, { pluginId: mintTypeId(ID_PREFIX.plugin, createSeededIds().next), surfaceId: "missing_page" });
  await page.getByRole("button", { name: "Open the page", exact: true }).click();
  await hold.requested;
  // The pick settles in the store after the pane mounts, so the pane swaps arms twice before the page read lands.
  const pane = page.getByTestId(testId("extensionsContent"));
  await expect(pane).toBeFocused();
  hold.release();
  await expect(page.getByRole("heading", { name: EXTENSIONS_GONE_TITLE, exact: true })).toBeVisible();
  await expect(pane).toBeFocused();
});
