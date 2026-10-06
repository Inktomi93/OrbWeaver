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
import { ExtensionsSectionStory, PluginConfigurationStory } from "../client/features/plugin/_ct-stories.tsx";
import type { TrpcInput, TrpcWireOutput } from "../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../support/node/route-trpc.ts";

const PLUGIN_ID = castId<PluginId>("plugin_ct_configuration");

async function configuredBundle(slug: string): Promise<{
  states: Map<string, Record<string, unknown>>;
  kv: Map<string, string>;
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
  if (main === undefined) {
    throw new Error(`${slug} has no server guest`);
  }
  const surfaces: TrpcWireOutput<"plugin.listSurfaces">[number][] = [];
  const actions = new Map<string, (input: { actionId: string; values: Record<string, string>; chat: null }) => Promise<void> | void>();
  let openDialog: string | undefined;
  const states = new Map<string, Record<string, unknown>>();
  const kv = new Map<string, string>();
  const context = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, context);
  context["orb"] = {
    host: (): Record<string, unknown> => ({
      grants: manifest.capabilities,
      clock: { nowEpochMs: (): number => 1_750_000_000_000 },
      events: { on: (): void => undefined },
      log: { info: (): void => undefined, warn: (): void => undefined },
      storage: {
        list: (prefix: string): Promise<string[]> => Promise.resolve([...kv.keys()].filter((key) => key.startsWith(prefix))),
        get: (key: string): Promise<string | null> => Promise.resolve(kv.get(key) ?? null),
      },
      ui: {
        registerCommand: (): void => undefined,
        setState: (id: string, state: Record<string, unknown>): Promise<void> => {
          states.set(id, state);
          return Promise.resolve();
        },
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
    states,
    kv,
    row,
    surfaces,
    ui: new TextDecoder().decode(ui ?? new Uint8Array()),
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

test("Affinity's real settings guest renders no reading before refresh and after an empty read", async ({ mount, page }) => {
  const bundle = await configuredBundle("affinity-tracker");
  await routeTrpc(page, {
    "plugin.list": () => [bundle.row],
    "plugin.listSurfaces": () => bundle.surfaces,
    "plugin.getSurfaceState": (input) => bundle.states.get(input.surfaceId) ?? null,
    "plugin.invokeUiAction": bundle.invoke,
  });
  await mount(
    <PluginConfigurationStory pluginId={PLUGIN_ID} pluginName={bundle.row.name} grants={bundle.row.grantedCapabilities as readonly PluginCapability[]} />,
  );
  await expect(page.getByText("First reading after 8 messages", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter")).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh readings", exact: true }).click();
  await expect(page.getByText("First reading after 8 messages", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter")).toHaveCount(0);
  await expect(page.getByText("Chats tracked", { exact: true })).toHaveCount(0);
});

for (const score of ["0", "7"]) {
  test(`Affinity's real settings guest renders a real ${score} reading`, async ({ mount, page }) => {
    const bundle = await configuredBundle("affinity-tracker");
    bundle.kv.set("score:room", score);
    await routeTrpc(page, {
      "plugin.list": () => [bundle.row],
      "plugin.listSurfaces": () => bundle.surfaces,
      "plugin.getSurfaceState": (input) => bundle.states.get(input.surfaceId) ?? null,
      "plugin.invokeUiAction": bundle.invoke,
    });
    await mount(
      <PluginConfigurationStory pluginId={PLUGIN_ID} pluginName={bundle.row.name} grants={bundle.row.grantedCapabilities as readonly PluginCapability[]} />,
    );
    await page.getByRole("button", { name: "Refresh readings", exact: true }).click();
    await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", score);
    await expect(page.getByText(`${score} / 10`, { exact: true })).toBeVisible();
  });
}

test("Keepsake's real empty album teaches the in-chat command and uses body-face attribution", async ({ mount, page }) => {
  const bundle = await configuredBundle("keepsake-camera");
  await routeTrpc(page, {
    "plugin.list": () => [bundle.row],
    "plugin.listSurfaces": () => bundle.surfaces,
    "plugin.getSurfaceState": (input) => bundle.states.get(input.surfaceId) ?? null,
    "sessions.me": () => ({ userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" }),
  });
  await mount(<ExtensionsSectionStory />);
  const row = page.getByRole("button", { name: "The Album · Keepsake Camera", exact: true });
  await row.click();
  const body = page.getByRole("group", { name: "Keepsake Camera — The Album", exact: true });
  await expect(body.getByText(/The camera paints/)).toBeVisible();
  await expect(body.getByText(/Plugin commands/)).toBeVisible();
  await expect(body.getByText("0 keepsakes", { exact: true })).toHaveCount(0);
  const qualifier = row.locator('[data-slot="list-row-title-qualifier"]');
  await expect(qualifier).toContainText("Keepsake Camera");
  await expect
    .poll(() =>
      row.evaluate(
        (node) =>
          getComputedStyle(node.querySelector('[data-slot="list-row-title"]') ?? node).fontFamily ===
          getComputedStyle(node.querySelector('[data-slot="list-row-title-qualifier"]') ?? node).fontFamily,
      ),
    )
    .toBe(true);
});
