// CT: terminal plugin lifecycle transitions reconcile the already-warmed surface and command catalogs, so
// resident contribution chrome disappears without a reload.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginTerminalInvalidationStory } from "../_ct-stories.tsx";

type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

const PLUGIN_ID = castId<PluginId>("plugin_ct_terminal00000001");
const SURFACE = {
  pluginId: PLUGIN_ID,
  id: "resident-settings",
  anchor: "settings",
  title: "Resident settings",
  tier: "static",
  spec: { kind: "text", value: "Resident surface content" },
} satisfies PluginSurfaceRow;
const COMMANDS: TrpcWireOutput<"plugin.listCommands"> = [
  {
    pluginId: PLUGIN_ID,
    slug: "resident-plugin",
    pluginName: "Resident plugin",
    name: "inspect",
    describe: "Inspect the resident plugin",
    args: [],
    group: "Tools",
    placements: [],
  },
];

for (const transition of ["uninstall", "withdraw", "auto-disable"] as const) {
  test(`${transition} clears warmed surface and command catalogs`, async ({ mount, page }) => {
    let resident = true;
    const catalogs: TrpcRoutes<"plugin.listSurfaces" | "plugin.listCommands"> = {
      "plugin.listSurfaces": () => (resident ? [SURFACE] : []),
      "plugin.listCommands": () => (resident ? COMMANDS : []),
    };
    const removeContributions = (): null => {
      resident = false;
      return null;
    };
    const recorder = await routeTrpc(page, {
      ...catalogs,
      "plugin.uninstall": removeContributions,
      "plugin.uninstallForAllUsers": () => {
        resident = false;
        return { slug: "resident-plugin", name: "Resident plugin", version: "1.0.0", applied: 1, skipped: [] };
      },
      "plugin.reportUiCrash": removeContributions,
    });
    const component = await mount(<PluginTerminalInvalidationStory pluginId={PLUGIN_ID} transition={transition} />);

    await expect(component.getByRole("group", { name: "Resident plugin — Resident settings" })).toBeVisible();
    await component.getByRole("button", { name: "Plugin commands" }).click();
    await expect(page.getByRole("menuitem", { name: "Resident plugin (resident-plugin) · Tools · Run inspect · Inspect the resident plugin" })).toBeVisible();
    await page.keyboard.press("Escape");

    await component.getByRole("button", { name: `Run ${transition}`, exact: true }).click();
    await expect(component.getByRole("group", { name: "Resident plugin — Resident settings" })).toHaveCount(0);
    await expect(component.getByRole("button", { name: "Plugin commands" })).toHaveCount(0);
    await expect.poll(() => recorder.count("plugin.listSurfaces")).toBeGreaterThanOrEqual(2);
    await expect.poll(() => recorder.count("plugin.listCommands")).toBeGreaterThanOrEqual(2);
  });
}
