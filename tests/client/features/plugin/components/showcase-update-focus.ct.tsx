// A shipped example that an owner took over updates in one press, with no review to open. The press that applies it unmounts, so keyboard
// focus returns to the row's update check instead of falling to the page. The plugin is a shipped example installed at an older version
// through the root's install door, so the update the row offers is the one the server computes from the bundled copy.
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle, requireShowcaseManifest } from "@orb/testkit/node/composed";
import { pluginCheckForUpdatesLabel, pluginDetailsLabel, pluginUpdateToLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginActionGroupsStory } from "./_update-action-groups-stories.tsx";

const STORY = "tests/client/features/plugin/components/_update-action-groups-stories/PluginActionGroupsStory";
const STORY_WIDTH = 720;
const OLDER_VERSION = "0.0.0";

test("a shipped example's one-press update hands keyboard focus back to the update check", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const owner = await root.principalFor(root.ownerId);
  // Take one of the examples the corpus ships and put it back at an older version, as an owner who changed it would hold it.
  const shipped = (await caller.plugin.list()).find((row) => row.updateSource === "showcase");
  if (shipped === undefined) {
    throw new Error("the corpus holds no shipped example");
  }
  const current = await requireShowcaseManifest(shipped.slug);
  await caller.plugin.uninstall({ pluginId: shipped.id });
  const older = pluginManifestSchema.parse({ ...current, version: OLDER_VERSION });
  await root.services.plugin.install({
    caller: owner,
    bundle: makePluginBundle(
      older,
      "orb.host(1);",
      root.clock.now(),
      older.uiEntry === undefined ? {} : { [older.uiEntry]: new TextEncoder().encode("orb.ui(1);") },
    ),
    grant: [],
  });
  const calls = await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "plugin.list",
      "plugin.listSurfaces",
      "plugin.getLog",
      "plugin.checkForUpdates",
      "plugin.upgradeFromShowcase",
      "plugin.listCommands",
      "plugin.listMacros",
      "plugin.listBundleAssets",
      "connection.listBindings",
    ]),
  );
  await mount<typeof PluginActionGroupsStory>(STORY, { width: STORY_WIDTH, appearance: appearanceSettingsSchema.parse({}) });

  await page.getByRole("button", { name: pluginDetailsLabel(older.name), exact: true }).click();
  const check = page.getByRole("button", { name: pluginCheckForUpdatesLabel(older.name), exact: true });
  const update = page.getByRole("button", { name: pluginUpdateToLabel(older.name, current.version), exact: true });
  await check.focus();
  await page.keyboard.press("Enter");
  await update.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => calls.count("plugin.upgradeFromShowcase")).toBe(1);
  await expect(update).toHaveCount(0);
  expect((await caller.plugin.list()).find((row) => row.slug === shipped.slug)).toMatchObject({ version: current.version });
  await expect(check).toBeFocused();
});
