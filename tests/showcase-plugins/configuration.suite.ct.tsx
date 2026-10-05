import { join } from "node:path";
import vm from "node:vm";
import type { PluginCapability, PluginUiOutcome } from "@orb/contracts/plugin";
import { pluginManifestSchema, pluginSurfaceRegistrationMetaSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { expect, test } from "@playwright/experimental-ct-react";
import { unzipSync } from "fflate";
import { PluginConfigurationStory } from "../client/features/plugin/_ct-stories.tsx";
import type { TrpcInput, TrpcWireOutput } from "../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../support/node/route-trpc.ts";

const PLUGIN_ID = castId<PluginId>("plugin_ct_configuration");

async function configuredBundle(slug: string): Promise<{
  row: TrpcWireOutput<"plugin.list">[number];
  surfaces: TrpcWireOutput<"plugin.listSurfaces">;
  ui: string;
  invoke: (input: TrpcInput<"plugin.invokeUiAction">) => ReturnType<typeof trpcHold>;
}> {
  const root = join(import.meta.dirname, "..", "..");
  const built = await packPluginDirectory({
    pluginDirectory: join(root, "packages/showcase-plugins/bundles", slug),
    sdkDirectory: join(root, "packages/plugin-sdk"),
  });
  expect(built.diagnostics).toEqual([]);
  if (built.bundle === null) {
    throw new Error(`${slug} did not compile`);
  }
  const entries = unzipSync(built.bundle);
  const manifest = pluginManifestSchema.parse(JSON.parse(new TextDecoder().decode(entries["manifest.json"])));
  const main = entries["main.js"];
  const ui = entries["ui.js"];
  if (main === undefined || ui === undefined) {
    throw new Error(`${slug} has no complete guest pair`);
  }
  const surfaces: TrpcWireOutput<"plugin.listSurfaces">[number][] = [];
  const actions = new Map<string, (input: { actionId: string; values: Record<string, string>; chat: null }) => Promise<void> | void>();
  let openDialog: string | undefined;
  const context = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, context);
  context["orb"] = {
    host: (): Record<string, unknown> => ({
      grants: manifest.capabilities,
      events: { on: (): void => undefined },
      log: { info: (): void => undefined },
      ui: {
        register: (definition: { onAction?: typeof actions extends Map<string, infer Handler> ? Handler : never }): void => {
          const meta = pluginSurfaceRegistrationMetaSchema.parse(definition);
          surfaces.push({ pluginId: PLUGIN_ID, ...meta });
          if (definition.onAction !== undefined) {
            actions.set(meta.id, definition.onAction);
          }
        },
        openDialog: (id: string): Promise<void> => {
          openDialog = id;
          return Promise.resolve();
        },
      },
    }),
  };
  vm.runInContext(new TextDecoder().decode(main), context);
  const row = {
    id: PLUGIN_ID,
    slug,
    name: manifest.name,
    version: manifest.version,
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: manifest.capabilities,
    grantedCapabilities: manifest.capabilities,
    netHosts: manifest.netHosts ?? null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    description: manifest.description ?? null,
    lastError: null,
    installedAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
  } satisfies TrpcWireOutput<"plugin.list">[number];
  return {
    row,
    surfaces,
    ui: new TextDecoder().decode(ui),
    invoke: (input): ReturnType<typeof trpcHold> => {
      const held = trpcHold();
      const handler = actions.get(input.surfaceId);
      if (handler === undefined) {
        throw new Error(`No action handler for ${input.surfaceId}`);
      }
      openDialog = undefined;
      Promise.resolve(handler({ actionId: input.actionId, values: input.values, chat: null })).then(
        () => {
          const outcome: PluginUiOutcome = { toasts: [], ...(openDialog === undefined ? {} : { openDialog }) };
          held.release(outcome);
        },
        () => held.release(trpcError({ code: "INTERNAL_SERVER_ERROR", message: "Configuration action failed" })),
      );
      return held;
    },
  };
}

test("Research Familiar's real picker sends only the selected owned id and reloads the saved configuration", async ({ mount, page }) => {
  const bundle = await configuredBundle("research-familiar");
  let configured: string | null = null;
  const calls: string[] = [];
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [bundle.row],
    "plugin.listSurfaces": () => bundle.surfaces,
    "plugin.getSurfaceState": () => null,
    "plugin.invokeUiAction": bundle.invoke,
    "worldInfo.listBooks": () => [{ id: "wib_ct_owned", name: "Field Notes", description: "Your book", createdAt: 1 }],
    "plugin.uiHostCall": (input) => {
      calls.push(input.fn);
      const args: unknown = JSON.parse(input.argsJson);
      if (input.fn === "variables.set" && Array.isArray(args) && typeof args[1] === "string") {
        configured = args[1];
      }
      return { resultJson: JSON.stringify(input.fn === "variables.get" ? configured : null) };
    },
  });
  await page.route("**/api/plugin-ui/**", (route) => route.fulfill({ contentType: "application/octet-stream", body: bundle.ui }));
  await mount(
    <PluginConfigurationStory pluginId={PLUGIN_ID} pluginName={bundle.row.name} grants={bundle.row.grantedCapabilities as readonly PluginCapability[]} />,
  );
  await page.getByRole("button", { name: "Choose lore book", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Plugin", exact: true });
  const picker = dialog.getByRole("combobox", { name: "Lore book", exact: true });
  await expect(picker).toBeVisible();
  await picker.click();
  await page.getByRole("option", { name: "Field Notes", exact: true }).click();
  await expect(dialog.getByText("Destination updated.", { exact: true })).toBeVisible();
  expect(configured).toBe("wib_ct_owned");
  await expect
    .poll(() => recorder.lastInput("plugin.uiHostCall"))
    .toEqual({
      pluginId: PLUGIN_ID,
      fn: "variables.set",
      argsJson: JSON.stringify(["familiar_book_id", "wib_ct_owned"]),
    });
  expect(calls).toEqual(["variables.get", "variables.set"]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Choose lore book", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Plugin", exact: true }).getByRole("combobox", { name: "Lore book", exact: true })).toContainText(
    "Field Notes",
  );
});

test("Affinity's explicit Browse action opens its real dialog; a failed boot retries without an empty optional browser card", async ({ mount, page }) => {
  const bundle = await configuredBundle("affinity-tracker");
  let boots = 0;
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [bundle.row],
    "plugin.listSurfaces": () => bundle.surfaces,
    "plugin.getSurfaceState": () => ({}),
    "plugin.invokeUiAction": bundle.invoke,
    "plugin.reportUiCrash": () => null,
    "plugin.uiHostCall": () => ({ resultJson: JSON.stringify([]) }),
  });
  await page.route("**/api/plugin-ui/**", (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: ++boots === 1 ? 'throw new Error("boot failed")' : bundle.ui }),
  );
  await mount(
    <PluginConfigurationStory pluginId={PLUGIN_ID} pluginName={bundle.row.name} grants={bundle.row.grantedCapabilities as readonly PluginCapability[]} />,
  );
  await expect(page.getByRole("group", { name: "Affinity Tracker — Browse readings", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Browse readings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Plugin", exact: true });
  await expect(dialog.getByText("Couldn't load this plugin content.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Filter rooms", exact: true })).toBeVisible();
  await expect(dialog.getByText("No readings yet. The tracker takes one every few messages once a room gets going.", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.count("plugin.reportUiCrash")).toBe(1);
});
