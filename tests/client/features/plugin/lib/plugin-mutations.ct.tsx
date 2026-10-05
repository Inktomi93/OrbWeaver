// CT: terminal plugin lifecycle transitions reconcile the already-warmed surface and command catalogs, so
// resident contribution chrome disappears without a reload.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginDisplayLifecycleStory, PluginOptOutStory, PluginTerminalInvalidationStory } from "../_ct-stories.tsx";

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

test("toggle and same-name re-grant refresh an already-rendered display transform without reload", async ({ mount, page }) => {
  let active = true;
  let version = 1;
  const row = {
    id: PLUGIN_ID,
    slug: "polish",
    name: "Polish",
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["chat.transform"],
    grantedCapabilities: ["chat.transform"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    description: "Typesets your display",
    lastError: null,
    installedAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
  } satisfies TrpcWireOutput<"plugin.setGrant">;
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [row],
    "plugin.listDisplayTransforms": () => (active ? [{ pluginId: PLUGIN_ID, name: "typeset" }] : []),
    "plugin.transformForDisplay": () => ({ text: active ? `Annotation ${version}` : "Original transcript bytes" }),
    "plugin.setEnabled": (input) => {
      active = input.enabled;
      return null;
    },
    "plugin.setGrant": () => {
      version += 1;
      return row;
    },
  });
  const component = await mount(<PluginDisplayLifecycleStory pluginId={PLUGIN_ID} />);
  const transcript = component.getByRole("status", { name: "Transcript row" });
  await expect(transcript).toHaveText("Annotation 1");
  await component.getByRole("button", { name: "Disable plugin", exact: true }).click();
  await expect(transcript).toHaveText("Original transcript bytes");
  await component.getByRole("button", { name: "Enable plugin", exact: true }).click();
  await expect(transcript).toHaveText("Annotation 1");
  await component.getByRole("button", { name: "Change grants", exact: true }).click();
  await expect(transcript).toHaveText("Annotation 2");
  await expect.poll(() => recorder.count("plugin.listDisplayTransforms")).toBeGreaterThanOrEqual(4);
});

test("the documented Draft Polish switch removes Polish and restores displayed bytes without reload", async ({ mount, page }) => {
  let enabled = true;
  const row = {
    id: PLUGIN_ID,
    slug: "draft-polish",
    name: "Draft Polish",
    version: "1.2.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["ui.surface", "chat.transform"],
    grantedCapabilities: ["ui.surface", "chat.transform"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    description: "Explicit draft polishing and display typography",
    lastError: null,
    installedAt: 1,
    updatedAt: 1,
  } satisfies TrpcWireOutput<"plugin.list">[number];
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [{ ...row, status: enabled ? "enabled" : "disabled" }],
    "plugin.listSurfaces": [],
    "plugin.getLog": [],
    "plugin.listCommands": (): TrpcWireOutput<"plugin.listCommands"> =>
      enabled
        ? [
            {
              pluginId: PLUGIN_ID,
              slug: row.slug,
              pluginName: row.name,
              name: "polish",
              describe: row.description,
              args: [],
              group: null,
              composerDraft: true,
              placements: [{ target: "composer-action", label: "Polish", icon: "sparkles" }],
            },
          ]
        : [],
    "plugin.listDisplayTransforms": () => (enabled ? [{ pluginId: PLUGIN_ID, name: "typeset" }] : []),
    "plugin.transformForDisplay": { text: "Viewer-only typography" },
    "plugin.setEnabled": (input) => {
      enabled = input.enabled;
      return null;
    },
  });
  await mount(<PluginOptOutStory />);
  const transcript = page.getByRole("status", { name: "Transcript row", exact: true });
  const polish = page.getByRole("button", { name: "Draft Polish (draft-polish) · Commands · Run Polish", exact: true });
  await expect(polish).toBeVisible();
  await expect(transcript).toHaveText("Viewer-only typography");
  const card = page.getByRole("group", { name: "Draft Polish plugin", exact: true });
  await card.getByRole("switch", { name: "Turn Draft Polish off", exact: true }).click();
  await expect(polish).toHaveCount(0);
  await expect(transcript).toHaveText("Original transcript bytes");
  await expect.poll(() => recorder.lastInput("plugin.setEnabled")).toEqual({ pluginId: PLUGIN_ID, enabled: false });
  await card.getByRole("switch", { name: "Turn Draft Polish on", exact: true }).click();
  await expect(polish).toBeVisible();
  await expect(transcript).toHaveText("Viewer-only typography");
});

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
      // The renderer's own state read (`PluginSurfaceRenderer` reads `getSurfaceState` for every surface it
      // draws); `null` is the Tier-S default — the spec alone renders, with no published state.
      "plugin.getSurfaceState": () => null,
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
