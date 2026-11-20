// @subject packages/client/src/features/plugin/components/plugin-dialog-body.tsx
// The plugin dialog resolves its surface through the shared boundary: a held read shows the loading skeleton, a failed one the shared
// error block, and Retry settles on the gone state when the plugin no longer serves the surface.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { PLUGIN_DIALOG_GONE_TITLE, PLUGIN_DIALOG_LOADING_NAME, PLUGIN_DIALOG_READ_LABEL } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PluginDialogShellStory } from "./_plugin-dialog-stories.tsx";

const EXTRA_READS = [
  "persona.list",
  "notifications.list",
  "plugin.listCommands",
  "databank.bankHealth",
  "rosterPreset.count",
  "connection.list",
  "connection.listBindings",
] as const;
const STORY = "tests/client/features/plugin/components/_plugin-dialog-stories/PluginDialogShellStory";

test("a held plugin dialog read shows the loading skeleton, a failed one the error block, and Retry shows the gone state", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...EXTRA_READS]),
    ...serveCorpusProcedures(caller, ["plugin.list", "plugin.listSurfaces"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await mount<typeof PluginDialogShellStory>(STORY, { subject: { pluginId: mintTypeId(ID_PREFIX.plugin, createSeededIds().next), surfaceId: "gone" } });
  const dialog = page.getByRole("dialog");
  await hold.requested;
  await expect(dialog.getByText(PLUGIN_DIALOG_LOADING_NAME, { exact: true })).toBeVisible();
  hold.fail();
  await expect(dialog.getByText(queryFailedLabel(PLUGIN_DIALOG_READ_LABEL), { exact: true })).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(dialog.getByText(PLUGIN_DIALOG_GONE_TITLE, { exact: true })).toBeVisible();
});
