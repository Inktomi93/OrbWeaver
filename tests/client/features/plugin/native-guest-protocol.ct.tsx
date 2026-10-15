import type { UiGuestInbound, UiGuestOutbound } from "@orb/client/lib";
import { viewerViewSchema } from "@orb/contracts/identity";
import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import { makePluginRow, makePluginScriptedPage } from "@orb/testkit/node/factories/plugin-view.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { routeTrpc, trpcError } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { PluginProtocolStory } from "./_ct-stories.tsx";

const OBSERVATIONS = "orb-native-plugin-protocol";
const BOOT_LOG_MESSAGE = "Native browser boot";
const UI_SOURCE = `const ui = orb.ui(1);
ui.log.info(${JSON.stringify(BOOT_LOG_MESSAGE)});
const render = (value) => ui.render("protocol", { kind: "stack", children: [
  { kind: "text", value },
  { kind: "textField", label: "Ledger entry", name: "entry" },
  { kind: "button", label: "Read ledger", actionId: "read" },
  { kind: "button", label: "Refused ledger", actionId: "refuse" },
  { kind: "button", label: "Crash guest", actionId: "crash" }
] });
render("Native browser ready");
ui.onEvent(async ({ event, values }) => {
  if (event.type === "field") { render("Draft: " + event.value); return; }
  if (event.actionId === "crash") throw new TypeError("Native event refusal");
  try {
    const value = await ui.host.storage.get(event.actionId);
    render("Read: " + value);
  } catch (error) {
    render("Refused: " + error.message);
  }
});`;

async function observeProtocol(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const inbound: UiGuestInbound[] = [];
    const outbound: UiGuestOutbound[] = [];
    const save = (): void => sessionStorage.setItem(key, JSON.stringify({ inbound, outbound }));
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", (event: MessageEvent<UiGuestOutbound>) => {
          outbound.push(event.data);
          save();
        });
      }
      override postMessage(message: UiGuestInbound, options?: StructuredSerializeOptions | Transferable[]): void {
        inbound.push(message);
        save();
        if (Array.isArray(options)) {
          super.postMessage(message, options);
        } else {
          super.postMessage(message, options);
        }
      }
    };
  }, OBSERVATIONS);
}

test("the native Worker exchanges boot, render, event, host-call/result and settlement through the production contribution", async ({ mount, page }) => {
  const plugin = makePluginRow({
    name: "Native browser protocol",
    declaredCapabilities: ["ui.surface", "storage.kv"],
    grantedCapabilities: ["ui.surface", "storage.kv"],
  });
  const surfaces = [makePluginScriptedPage(plugin.id)];
  const settings = userSettingsView();
  const caller = principal(settings.userId);
  const me = viewerViewSchema.parse({ userId: caller.userId, handle: caller.handle, globalRole: caller.role });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => me,
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => surfaces,
    "plugin.getSurfaceState": () => null,
    "plugin.uiHostCall": (input) =>
      input.argsJson === '["refuse"]' ? trpcError({ message: "Native relay refusal", code: "FORBIDDEN" }) : { resultJson: '"Native ledger"' },
    "plugin.reportUiCrash": () => undefined,
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: UI_SOURCE }));
  await observeProtocol(page);
  await mount(<PluginProtocolStory pluginId={plugin.id} />);
  await expect(page.getByText("Native browser ready", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Ledger entry", exact: true }).fill("Native field");
  await expect(page.getByText("Draft: Native field", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read ledger", exact: true }).click();
  await expect(page.getByText("Read: Native ledger", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refused ledger", exact: true }).click();
  await expect(page.getByText("Refused: Native relay refusal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crash guest", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  const messages = await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS);
  const bootLog = { kind: "log", level: "info", message: BOOT_LOG_MESSAGE } satisfies Extract<UiGuestOutbound, { kind: "log" }>;
  expect(messages).toContain(JSON.stringify(bootLog));
  expect(messages).toContain('"kind":"boot"');
  expect(messages).toContain('"kind":"ready","ok":true');
  expect(messages).toContain('"kind":"render"');
  expect(messages).toContain('"kind":"event"');
  expect(messages).toContain('"type":"field","name":"entry","value":"Native field"');
  expect(messages).toContain('"kind":"hostCall"');
  expect(messages).toContain('"kind":"hostResult"');
  expect(messages).toContain('"kind":"settled","ok":true');
  expect(messages).toContain('"kind":"hostResult","callId":2,"ok":false');
  expect(messages).toContain('"kind":"settled","ok":false');
  expect(trpc.unstubbed()).toEqual([]);
});

test("a native guest boot failure publishes ready:false and reports the original cause through the selected page", async ({ mount, page }) => {
  const plugin = makePluginRow();
  const settings = userSettingsView();
  const caller = principal(settings.userId);
  const me = viewerViewSchema.parse({ userId: caller.userId, handle: caller.handle, globalRole: caller.role });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => me,
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": () => null,
    "plugin.reportUiCrash": () => undefined,
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: 'throw new TypeError("Native boot refusal");' }),
  );
  await observeProtocol(page);
  await mount(<PluginProtocolStory pluginId={plugin.id} />);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect
    .poll(() => trpc.lastInput("plugin.reportUiCrash"))
    .toMatchObject({ pluginId: plugin.id, surfaceId: "protocol", reason: expect.stringContaining("Native boot refusal") });
  const messages = await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS);
  expect(messages).toContain('"kind":"ready","ok":false');
  expect(messages).toContain("TypeError: Native boot refusal");
  expect(trpc.unstubbed()).toEqual([]);
});
