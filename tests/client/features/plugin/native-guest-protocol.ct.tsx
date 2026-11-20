import type { UiGuestInbound, UiGuestOutbound, UiGuestReadyMessage, UiGuestSettledMessage, UiGuestUnavailableMessage } from "@orb/client/lib";
import type { UiProxyableHostFunction } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_CHANNEL_FULL_CODE,
  PLUGIN_LOG_CHARS_MAX,
  PLUGIN_LOG_LEVELS,
  PLUGIN_LOG_LINES_MAX,
  PLUGIN_UI_HOST_CALL_CODES,
  PLUGIN_UI_HOST_CALL_FAILED,
  PLUGIN_UI_ROUTE,
} from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { watchToastMounts } from "@orb/testkit/browser/spec";
import { noticeToast, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder, createCorpusViewerReadResponder, present } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow, makePluginScriptedPage } from "@orb/testkit/node/helpers";
import type { Page } from "@playwright/test";
import { EXTENSIONS_GONE_TITLE } from "#client/features/plugin/lib/extensions-copy.ts";
import { PLUGIN_SURFACE_KICKER } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import { BACKGROUND_JOB_LOGS } from "#client/lib/background-jobs.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { UI_GUEST_BUDGETS } from "#client/lib/plugin-ui-guest-protocol.ts";
import type { PluginProtocolStory } from "./_ct-stories.tsx";

/** The server refuses a plugin the owner does not have, so a request for any other id is a defect, not an answer. */
function knownPlugin<const T>(pluginId: PluginId, answer: T): (input: { readonly pluginId: PluginId }) => T | ReturnType<typeof trpcError> {
  return (input) => (input.pluginId === pluginId ? answer : trpcError({ code: "NOT_FOUND" }));
}

const OBSERVATIONS = "orb-native-plugin-protocol";
const LOG_OBSERVATIONS = `${OBSERVATIONS}:logs`;
const BOOT_LOG_MESSAGE = "Native browser boot";
const EVENT_FAILURE_MESSAGE = "Native event refusal";
const RELAY_FAILURE_MESSAGE = "Native relay refusal";
const BOOT_FAILURE_MESSAGE = "Native boot refusal";
const CRASH_REPORT_FAILURE_MESSAGE = "Native crash report refusal";
const CONTROL_NOTICE = "Control notice";
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
  if (event.actionId === "crash") throw new TypeError(${JSON.stringify(EVENT_FAILURE_MESSAGE)});
  try {
    const value = await ui.host.storage.get(event.actionId);
    render("Read: " + value + "; entry: " + JSON.stringify(values.entry));
  } catch (error) {
    render("Refused: " + error.message);
  }
});`;

async function observeProtocol(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, logKey }) => {
      if (globalThis.top !== globalThis.window) {
        return;
      }
      const inbound: UiGuestInbound[] = [];
      const outbound: UiGuestOutbound[] = [];
      const save = (): void => {
        sessionStorage.setItem(key, JSON.stringify({ inbound, outbound }));
        sessionStorage.setItem(logKey, JSON.stringify(outbound.filter((message) => message.kind === "log")));
      };
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
    },
    { key: OBSERVATIONS, logKey: LOG_OBSERVATIONS },
  );
}

// Retain actual result frames, never the boot source, clock or entropy payload.
async function readProtocolResults(page: Page): Promise<{ inbound: JsonValue[]; outbound: JsonValue[] }> {
  const frames = jsonValueSchema.parse(JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS)) ?? "null"));
  if (frames === null || typeof frames !== "object" || Array.isArray(frames) || !Array.isArray(frames["inbound"]) || !Array.isArray(frames["outbound"])) {
    throw new Error("Native protocol observation has no message arrays");
  }
  return {
    inbound: frames["inbound"].filter((frame) => frame !== null && typeof frame === "object" && !Array.isArray(frame) && frame["kind"] === "hostResult"),
    outbound: frames["outbound"].filter(
      (frame) => frame !== null && typeof frame === "object" && !Array.isArray(frame) && (frame["kind"] === "ready" || frame["kind"] === "settled"),
    ),
  };
}

for (const mode of ["lines", "chars"] as const) {
  test(`native Worker log ${mode} limits preserve actual severity and refuse later overflow without stopping rendering`, async ({
    corpus,
    corpusViewer,
    mount,
    page,
  }) => {
    const plugin = makePluginRow({ declaredCapabilities: ["ui.surface"], grantedCapabilities: ["ui.surface"] });
    const trpc = await routeTrpc(page, {
      "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
      "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
      "plugin.list": () => [plugin],
      "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
      "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    });
    const expected: Extract<UiGuestOutbound, { kind: "log" }>[] =
      mode === "lines"
        ? [
            ...PLUGIN_LOG_LEVELS.map((level) => ({ kind: "log" as const, level, message: `Native ${level}` })),
            ...Array.from({ length: PLUGIN_LOG_LINES_MAX - PLUGIN_LOG_LEVELS.length }, (_, index) => ({
              kind: "log" as const,
              level: "info" as const,
              message: `line:${index}`,
            })),
          ]
        : [{ kind: "log", level: "warn", message: "x".repeat(PLUGIN_LOG_CHARS_MAX) }];
    const source = `const ui=orb.ui(1);
      ${mode === "lines" ? `for(const level of ${JSON.stringify(PLUGIN_LOG_LEVELS)})ui.log[level]("Native "+level);for(let line=0;line<${PLUGIN_LOG_LINES_MAX + 1};line+=1)ui.log.info("line:"+line);` : `ui.log.warn("x".repeat(${PLUGIN_LOG_CHARS_MAX * 2}));ui.log.error("after byte cap");`}
      const render=(value)=>ui.render("protocol",{kind:"stack",children:[{kind:"text",value},{kind:"button",label:"Try a late log",actionId:"late"}]});
      render("Native logs settled");ui.onEvent(()=>{ui.log.error("after lifetime cap");render("Native late log settled");});`;
    await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: source }));
    await observeProtocol(page);
    await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
    await expect(page.getByText("Native logs settled", { exact: true })).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), LOG_OBSERVATIONS)).toBe(JSON.stringify(expected));
    await page.getByRole("button", { name: "Try a late log", exact: true }).click();
    await expect(page.getByText("Native late log settled", { exact: true })).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), LOG_OBSERVATIONS)).toBe(JSON.stringify(expected));
    expect(trpc.count("plugin.reportUiCrash")).toBe(0);
  });
}

test("the native Worker exchanges boot, render, event, host-call/result and settlement through the production contribution", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  const plugin = makePluginRow({
    name: "Native browser protocol",
    declaredCapabilities: ["ui.surface", "storage.kv"],
    grantedCapabilities: ["ui.surface", "storage.kv"],
  });
  const surfaces = [makePluginScriptedPage(plugin.id)];
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => surfaces,
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.uiHostCall": (input) =>
      input.argsJson === '["refuse"]' ? trpcError({ message: RELAY_FAILURE_MESSAGE, code: "FORBIDDEN" }) : { resultJson: '"Native ledger"' },
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: UI_SOURCE }));
  const retired: Promise<void>[] = [];
  page.on("worker", (worker) => retired.push(new Promise<void>((resolve) => worker.once("close", () => resolve()))));
  await observeProtocol(page);
  const component = await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  await expect(page.getByText("Native browser ready", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Ledger entry", exact: true }).fill("Native field");
  await expect(page.getByText("Draft: Native field", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read ledger", exact: true }).click();
  await expect(page.getByText('Read: Native ledger; entry: "Native field"', { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refused ledger", exact: true }).click();
  // A refusal with no allowlisted reason reaches plugin code as the fixed sentence, never the server's text.
  await expect(page.getByText(`Refused: ${PLUGIN_UI_HOST_CALL_FAILED}`, { exact: true })).toBeVisible();
  await expect(page.getByText(RELAY_FAILURE_MESSAGE)).toHaveCount(0);
  expect(trpc.count("plugin.reportUiCrash")).toBe(0);
  expect(page.workers()).toHaveLength(1);
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Crash guest", exact: true }).click();
  const retry = page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
  await expect(retry).toBeVisible();
  await Promise.all(retired);
  expect(retired).toHaveLength(1);
  expect(page.workers()).toHaveLength(0);
  await expect
    .poll(() => trpc.lastInput("plugin.reportUiCrash"))
    .toEqual({
      pluginId: plugin.id,
      surfaceId: "protocol",
      reason: `the plugin's interface failed while handling an interaction: TypeError: ${EVENT_FAILURE_MESSAGE}`,
    });
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
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
  const nextWorker = page.waitForEvent("worker");
  await retry.click();
  await nextWorker;
  await expect(page.getByText("Native browser ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ledger entry", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Read ledger", exact: true }).click();
  await expect(page.getByText('Read: Native ledger; entry: ""', { exact: true })).toBeVisible();
  expect(retired).toHaveLength(2);
  expect(page.workers()).toHaveLength(1);
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
  const settledFailure = { kind: "settled", ok: false, message: `TypeError: ${EVENT_FAILURE_MESSAGE}` } satisfies UiGuestSettledMessage;
  const refusedResult = { kind: "hostResult", callId: 2, ok: false, message: PLUGIN_UI_HOST_CALL_FAILED } satisfies Extract<
    UiGuestInbound,
    { kind: "hostResult" }
  >;
  const expectedResults = {
    inbound: [
      { kind: "hostResult", callId: 1, ok: true, resultJson: '"Native ledger"' },
      refusedResult,
      { kind: "hostResult", callId: 1, ok: true, resultJson: '"Native ledger"' },
    ],
    outbound: [
      { kind: "ready", ok: true },
      { kind: "settled", ok: true },
      { kind: "settled", ok: true },
      { kind: "settled", ok: true },
      settledFailure,
      { kind: "ready", ok: true },
      { kind: "settled", ok: true },
    ],
  };
  await expect.poll(() => readProtocolResults(page)).toEqual(expectedResults);
  await test
    .info()
    .attach("native-event-failure-results", { body: Buffer.from(JSON.stringify(await readProtocolResults(page))), contentType: "application/json" });
  await component.unmount();
  await Promise.all(retired);
  expect(page.workers()).toHaveLength(0);
});

const REFUSAL_SURFACE_READY = "Refusal guest ready";
const NO_CODE = "no code";
// The text a server fault might carry; it must never reach plugin code.
const SERVER_FAULT_TEXT = "SQLITE_BUSY: database is locked at /app/data/db/orbweaver.db";
const REFUSAL_SOURCE = `const ui = orb.ui(1);
const render = (value) => ui.render("protocol", { kind: "stack", children: [
  { kind: "text", value },
  { kind: "button", label: "Read a variable", actionId: "variable" },
  { kind: "button", label: "Read a numeric key", actionId: "numeric" },
  { kind: "button", label: "Read through a fault", actionId: "fault" }
] });
render(${JSON.stringify(REFUSAL_SURFACE_READY)});
ui.onEvent(async ({ event }) => {
  try {
    if (event.actionId === "variable") await ui.host.variables.get("anything");
    else if (event.actionId === "numeric") await ui.host.storage.get(42);
    else await ui.host.storage.get("fault");
    render("resolved");
  } catch (error) {
    render(error.name + "|" + (error.code === undefined ? ${JSON.stringify(NO_CODE)} : error.code) + "|" + error.message);
  }
});`;

test("a scripted guest's refused host call carries the server's allowlisted code, and any other failure reaches it codeless and generic", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const stage = root.corpus.wire.pluginLibrary?.recipientActive;
  if (stage === undefined) {
    throw new Error("The committed corpus has no recipient plugin stage");
  }
  const { pluginId } = stage.ids;
  const caller = await root.internalCallerFor(stage.viewerUserId);
  const plugin = (await caller.plugin.list()).find(({ id }) => id === pluginId);
  // The relay re-gates against this stored row: enabled, holding storage.kv and not global_vars.
  expect(plugin).toMatchObject({ status: "enabled", grantedCapabilities: expect.arrayContaining(["storage.kv"]) });
  expect(present(plugin).grantedCapabilities).not.toContain(HOST_FUNCTION_CAPABILITY["variables.get"]);
  const serverRefusal = async (fn: UiProxyableHostFunction, argsJson: string): Promise<string> =>
    await caller.plugin.uiHostCall({ pluginId, fn, argsJson }).then(
      () => {
        throw new Error(`${fn} was not refused`);
      },
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
  const trpc = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "plugin.list", "plugin.uiHostCall"], (input) =>
      // A coded refusal outside the allowlist, carrying text a fault could hold.
      typeof input === "object" && "argsJson" in input && input.argsJson === '["fault"]'
        ? trpcError({ code: "CONFLICT", message: SERVER_FAULT_TEXT, reason: PLUGIN_CHANNEL_FULL_CODE })
        : undefined,
    ),
    "plugin.listSurfaces": () => [makePluginScriptedPage(pluginId)],
    "plugin.getSurfaceState": knownPlugin(pluginId, null),
    "plugin.reportUiCrash": knownPlugin(pluginId, undefined),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${pluginId}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: REFUSAL_SOURCE }));
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId });
  await expect(page.getByText(REFUSAL_SURFACE_READY, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Read a variable", exact: true }).click();
  const notGranted = await serverRefusal("variables.get", '["anything"]');
  await expect(page.getByText(`Error|${PLUGIN_UI_HOST_CALL_CODES.notGranted}|${notGranted}`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Read a numeric key", exact: true }).click();
  const argsInvalid = await serverRefusal("storage.get", "[42]");
  await expect(page.getByText(`Error|${PLUGIN_UI_HOST_CALL_CODES.argsInvalid}|${argsInvalid}`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Read through a fault", exact: true }).click();
  await expect(page.getByText(`Error|${NO_CODE}|${PLUGIN_UI_HOST_CALL_FAILED}`, { exact: true })).toBeVisible();
  await expect(page.getByText(SERVER_FAULT_TEXT)).toHaveCount(0);
  expect(trpc.count("plugin.uiHostCall")).toBe(3);
  expect(trpc.count("plugin.reportUiCrash")).toBe(0);
});

test("a native guest boot failure publishes ready:false and reports the original cause through the selected page", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  const plugin = makePluginRow();
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  let source = `throw new TypeError(${JSON.stringify(BOOT_FAILURE_MESSAGE)});`;
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: source }));
  const retired: Promise<void>[] = [];
  page.on("worker", (worker) => retired.push(new Promise<void>((resolve) => worker.once("close", () => resolve()))));
  await observeProtocol(page);
  const component = await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await expect
    .poll(() => trpc.lastInput("plugin.reportUiCrash"))
    .toMatchObject({ pluginId: plugin.id, surfaceId: "protocol", reason: expect.stringContaining(BOOT_FAILURE_MESSAGE) });
  const messages = await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS);
  expect(messages).toContain('"kind":"ready","ok":false');
  expect(messages).toContain(`TypeError: ${BOOT_FAILURE_MESSAGE}`);
  await Promise.all(retired);
  expect(retired).toHaveLength(1);
  expect(page.workers()).toHaveLength(0);
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
  source = UI_SOURCE;
  const nextWorker = page.waitForEvent("worker");
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await nextWorker;
  await expect(page.getByText("Native browser ready", { exact: true })).toBeVisible();
  expect(retired).toHaveLength(2);
  expect(page.workers()).toHaveLength(1);
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
  const readyFailure = { kind: "ready", ok: false, message: `TypeError: ${BOOT_FAILURE_MESSAGE}` } satisfies UiGuestReadyMessage;
  await expect
    .poll(() => readProtocolResults(page))
    .toEqual({
      inbound: [],
      outbound: [readyFailure, { kind: "ready", ok: true }],
    });
  await test
    .info()
    .attach("native-boot-failure-results", { body: Buffer.from(JSON.stringify(await readProtocolResults(page))), contentType: "application/json" });
  await component.unmount();
  await Promise.all(retired);
  expect(page.workers()).toHaveLength(0);
});

/** A guest whose boot-time host call settles after boot, outside every event, into a `then` getter it put on
 *  `Object.prototype`: a resolve reads that getter, so a looping one runs wherever the settle runs. */
function thenGetterSource(loops: boolean): string {
  return `const ui = orb.ui(1);
let armed = false;
Object.defineProperty(Object.prototype, "then", { configurable: true, get() { if (armed) { for (;;) {} } return undefined; } });
ui.render("protocol", { kind: "stack", children: [{ kind: "text", value: "Settle guest booted" }] });
armed = ${String(loops)};
ui.host.storage.get("ledger").then((result) => {
  ui.render("protocol", { kind: "stack", children: [{ kind: "text", value: "Settled: " + result.entry }] });
});
undefined;`;
}

test("a host result whose then getter loops stops the guest past its CPU budget and reports the crash", async ({ corpus, corpusViewer, mount, page }) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface", "storage.kv"], grantedCapabilities: ["ui.surface", "storage.kv"] });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.uiHostCall": (input) =>
      input.fn === "storage.get" && input.argsJson === '["ledger"]'
        ? { resultJson: JSON.stringify({ entry: "Native ledger" }) }
        : trpcError({ code: "NOT_FOUND" }),
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  let source = thenGetterSource(true);
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: source }));
  const retired: Promise<void>[] = [];
  page.on("worker", (worker) => retired.push(new Promise<void>((resolve) => worker.once("close", () => resolve()))));
  await observeProtocol(page);
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  const retry = page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
  await expect(retry).toBeVisible();
  await Promise.all(retired);
  expect(page.workers()).toHaveLength(0);
  await expect.poll(() => trpc.lastInput("plugin.reportUiCrash")).toMatchObject({ pluginId: plugin.id, surfaceId: "protocol" });
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
  const stopped = { kind: "stopped" } satisfies Extract<UiGuestOutbound, { kind: "stopped" }>;
  expect(await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS)).toContain(JSON.stringify(stopped));

  // Control: the same guest with its getter disarmed settles the result and renders it, and reports nothing more.
  source = thenGetterSource(false);
  const nextWorker = page.waitForEvent("worker");
  await retry.click();
  await nextWorker;
  await expect(page.getByText("Settled: Native ledger", { exact: true })).toBeVisible();
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
});

// An event that awaits a host call and then rejects with an object whose `message` getter loops. The worker reads the
// rejection after the host call's settle and pump ran, so the read runs guest code under whatever deadline they left.
const LOOPING_REJECTION_SOURCE = `const ui = orb.ui(1);
ui.render("protocol", { kind: "stack", children: [{ kind: "text", value: "Rejection guest ready" }, { kind: "button", label: "Read then reject", actionId: "reject" }] });
ui.onEvent(async () => {
  await ui.host.storage.get("ledger");
  throw { get message() { for (;;) {} } };
});`;

test("an event that rejects after a host call is read under the event's own deadline, so the worker settles it as a failure", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface", "storage.kv"], grantedCapabilities: ["ui.surface", "storage.kv"] });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.uiHostCall": (input) => (input.fn === "storage.get" ? { resultJson: '"Native ledger"' } : trpcError({ code: "NOT_FOUND" })),
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: LOOPING_REJECTION_SOURCE }));
  await observeProtocol(page);
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  await page.getByRole("button", { name: "Read then reject", exact: true }).click();

  // A worker that lost the event's deadline wedges in that read, posts nothing, and only the host wall ends it.
  const failed = { kind: "settled", ok: false } satisfies Partial<UiGuestSettledMessage>;
  await expect.poll(async () => (await readProtocolResults(page)).outbound).toContainEqual(expect.objectContaining(failed));
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
});

// An event that waits on a host call past its CPU budget and then throws its own error, and one that spins. The error
// builds its message in a getter, which the worker runs when it reads the error, with enough work that the engine polls
// its interrupt during the read and well inside one event's budget.
const SLOW_HOST_FAILURE_MESSAGE = "Native failure after a slow host call";
const MESSAGE_WORK_ITERATIONS = 1_000_000;
const UI_HOST_CALL_PATH = "plugin.uiHostCall";
const SLOW_HOST_SOURCE = `const ui = orb.ui(1);
ui.render("protocol", { kind: "stack", children: [
  { kind: "text", value: "Slow host guest ready" },
  { kind: "button", label: "Wait then fail", actionId: "wait" },
  { kind: "button", label: "Spin", actionId: "spin" },
  { kind: "button", label: "Linger", actionId: "linger" }
] });
ui.onEvent(async ({ event }) => {
  if (event.actionId === "spin") { for (;;) {} }
  if (event.actionId === "linger") { await ui.host.storage.get("lingering"); return; }
  await ui.host.storage.get("ledger");
  throw new (class extends Error {
    get message() { let n = 0; for (let i = 0; i < ${MESSAGE_WORK_ITERATIONS}; i++) { n += i; } return ${JSON.stringify(SLOW_HOST_FAILURE_MESSAGE)}; }
  })();
});`;

// Wall time is the subject: the host call is held until the page's monotonic clock shows one event's CPU budget gone.
test("an event that waits past its CPU budget on a host call and then throws reports its own error, and a spin reports the interrupt", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface", "storage.kv"], grantedCapabilities: ["ui.surface", "storage.kv"] });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.uiHostCall": (input) =>
      input.fn === "storage.get" && input.argsJson === '["ledger"]' ? { resultJson: '"Native ledger"' } : trpcError({ code: "NOT_FOUND" }),
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  await page.route(
    (url) => url.pathname.includes(UI_HOST_CALL_PATH),
    async (route) => {
      const arrivedAt = await page.evaluate(() => performance.now());
      await page.waitForFunction(({ since, budgetMs }) => performance.now() - since > budgetMs, { since: arrivedAt, budgetMs: UI_GUEST_BUDGETS.eventCpuMs });
      await route.fallback();
    },
  );
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: SLOW_HOST_SOURCE }));
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  const retry = page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });

  await page.getByRole("button", { name: "Wait then fail", exact: true }).click();
  await expect(retry).toBeVisible();
  expect(trpc.count("plugin.uiHostCall")).toBe(1);
  await expect.poll(() => trpc.count("plugin.reportUiCrash")).toBe(1);
  expect(trpc.requireLastInput("plugin.reportUiCrash").reason).toContain(SLOW_HOST_FAILURE_MESSAGE);

  // Control: guest code that keeps running past the budget is still stopped, and its report names the interrupt.
  await retry.click();
  await page.getByRole("button", { name: "Spin", exact: true }).click();
  await expect.poll(() => trpc.count("plugin.reportUiCrash")).toBe(2);
  const spin = trpc.requireLastInput("plugin.reportUiCrash").reason;
  expect(spin).toContain("InternalError");
  expect(spin).not.toContain(SLOW_HOST_FAILURE_MESSAGE);
});

// The host sends an event without waiting for the last one to settle, so a later event can be waiting on its own host
// call when an earlier one reads its error. Wall time is the subject here too.
test("an event that fails while a later event still waits on a host call reports its own error", async ({ corpus, corpusViewer, mount, page }) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface", "storage.kv"], grantedCapabilities: ["ui.surface", "storage.kv"] });
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.uiHostCall": (input) =>
      input.fn === "storage.get" && (input.argsJson === '["ledger"]' || input.argsJson === '["lingering"]')
        ? { resultJson: '"Native ledger"' }
        : trpcError({ code: "NOT_FOUND" }),
    "plugin.reportUiCrash": knownPlugin(plugin.id, undefined),
  });
  let arrivals = 0;
  const { promise: lingering, resolve: releaseLingering } = Promise.withResolvers<void>();
  await page.route(
    (url) => url.pathname.includes(UI_HOST_CALL_PATH),
    async (route) => {
      arrivals += 1;
      if (arrivals === 1) {
        const arrivedAt = await page.evaluate(() => performance.now());
        await page.waitForFunction(({ since, budgetMs }) => performance.now() - since > budgetMs, { since: arrivedAt, budgetMs: UI_GUEST_BUDGETS.eventCpuMs });
      } else {
        await lingering;
      }
      await route.fallback();
    },
  );
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: SLOW_HOST_SOURCE }));
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });

  await page.getByRole("button", { name: "Wait then fail", exact: true }).click();
  await expect.poll(() => arrivals).toBe(1);
  await page.getByRole("button", { name: "Linger", exact: true }).click();
  await expect.poll(() => arrivals).toBe(2);
  await expect.poll(() => trpc.count("plugin.reportUiCrash")).toBe(1);
  releaseLingering();
  expect(trpc.requireLastInput("plugin.reportUiCrash").reason).toContain(SLOW_HOST_FAILURE_MESSAGE);
});

test("a crash report that fails writes its log and raises no toast, because the person did not start it", async ({ corpus, corpusViewer, mount, page }) => {
  const plugin = makePluginRow();
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": knownPlugin(plugin.id, null),
    "plugin.reportUiCrash": (input) => (input.reason.includes(BOOT_FAILURE_MESSAGE) ? trpcError({ message: CRASH_REPORT_FAILURE_MESSAGE }) : undefined),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: `throw new TypeError(${JSON.stringify(BOOT_FAILURE_MESSAGE)});` }),
  );
  const toastMounts = await watchToastMounts(page);
  const logged = page.waitForEvent("console", {
    predicate: (message) => message.type() === "error" && message.text().includes(BACKGROUND_JOB_LOGS.uiCrashReport),
  });
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", {
    pluginId: plugin.id,
    controlNotice: CONTROL_NOTICE,
  });
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await logged;
  expect(trpc.count("plugin.reportUiCrash")).toBe(1);
  await page.getByRole("button", { name: CONTROL_NOTICE, exact: true }).click();
  await expect(noticeToast(page, { title: CONTROL_NOTICE })).toBeVisible();
  expect(await toastMounts()).toBe(1);
});

test("the default shared corpus renders its native Ledger publication and captured disable through Extensions", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  const library = corpus.pluginLibrary;
  if (library === undefined) {
    throw new Error("The committed corpus has no plugin adoption cohort");
  }
  const active = library.ownerActive;
  const plugin = active.reads.plugins.output.find(({ id }) => id === active.ids.pluginId);
  const surface = active.reads.surfaces.output.find(({ pluginId, id }) => pluginId === active.ids.pluginId && id === active.ids.surfaceId);
  if (plugin === undefined || surface === undefined) {
    throw new Error("The shared corpus omitted its native Ledger page");
  }
  const viewerId = brandedId("UserId").parse(corpusViewer.userId);
  let stage = active;
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": (input) => createCorpusViewerReadResponder("plugin.list", viewerId, { viewerUserId: stage.viewerUserId, read: stage.reads.plugins })(input),
    "plugin.listSurfaces": (input) =>
      createCorpusViewerReadResponder("plugin.listSurfaces", viewerId, { viewerUserId: stage.viewerUserId, read: stage.reads.surfaces })(input),
    "plugin.getSurfaceState": (input) =>
      createCorpusViewerReadResponder("plugin.getSurfaceState", viewerId, { viewerUserId: stage.viewerUserId, read: stage.reads.state })(input),
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const component = await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", {
    runtimeEpoch: 0,
    pluginId: active.ids.pluginId,
    surfaceId: surface.id,
  });
  const attribution = page.getByRole("group", { name: `${plugin.name}: ${surface.title}`, exact: true });
  await expect(attribution.getByText("Initial ledger entry", { exact: true })).toBeVisible();
  await expect(page.getByText(plugin.name, { exact: true })).toBeVisible();
  await expect(page.getByText(PLUGIN_SURFACE_KICKER, { exact: true })).toBeVisible();
  expect(trpc.lastInput("plugin.getSurfaceState")).toEqual(active.reads.state.input);
  stage = library.ownerDisabled;
  await component.update({ runtimeEpoch: 1, pluginId: active.ids.pluginId, surfaceId: surface.id });
  await expect(page.getByText(EXTENSIONS_GONE_TITLE, { exact: true })).toBeVisible();
  await expect(attribution).toHaveCount(0);
  expect(errors).toEqual([]);
});

const memoryTest = test.extend({
  launchOptions: async ({ launchOptions }, provide) => {
    // Restrict only this fixture's isolated V8 instance; retain the native runner's ownership arguments.
    await provide({ ...launchOptions, args: [...(launchOptions.args ?? []), "--js-flags=--wasm-max-mem-pages=1"] });
  },
});

memoryTest(
  "native engine memory reservation refusal retires the real Worker without charging the plugin",
  async ({ corpus, corpusViewer, mount, page, browser }) => {
    const reservation = await page.evaluate(() => {
      const small = new WebAssembly.Memory({ initial: 1, maximum: 1 });
      try {
        const oversized = new WebAssembly.Memory({ initial: 2, maximum: 2 });
        return { smallBytes: small.buffer.byteLength, failure: null, unexpectedBytes: oversized.buffer.byteLength };
      } catch (error) {
        return { smallBytes: small.buffer.byteLength, failure: error instanceof Error ? { name: error.name, message: error.message } : null };
      }
    });
    expect(reservation.smallBytes).toBe(65_536);
    expect(reservation.failure).toMatchObject({ name: "RangeError", message: expect.any(String) });
    const plugin = makePluginRow({
      name: "Native reservation refusal",
      declaredCapabilities: ["ui.surface", "storage.kv"],
      grantedCapabilities: ["ui.surface", "storage.kv"],
    });
    const trpc = await routeTrpc(page, {
      "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
      "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
      "plugin.list": () => [plugin],
      "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
      "plugin.getSurfaceState": knownPlugin(plugin.id, null),
      "plugin.uiHostCall": knownPlugin(plugin.id, { resultJson: '"Native ledger"' }),
    });
    await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: UI_SOURCE }));
    const pageErrors: string[] = [];
    const closed: Promise<void>[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("worker", (worker) => closed.push(new Promise<void>((resolve) => worker.once("close", () => resolve()))));
    await observeProtocol(page);
    await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
    const retry = page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
    const unavailable = expect.objectContaining({
      kind: "unavailable" satisfies UiGuestUnavailableMessage["kind"],
      message: expect.stringMatching(/the browser could not reserve \d+ bytes for the plugin's interface:/u),
    });
    for (const attempt of [1, 2]) {
      await expect(retry).toBeVisible();
      expect(closed).toHaveLength(attempt);
      await Promise.all(closed);
      const frames = jsonValueSchema.parse(JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), OBSERVATIONS)) ?? "null"));
      expect(frames).toMatchObject({
        inbound: Array.from({ length: attempt }, () => expect.objectContaining({ kind: "boot" })),
        outbound: Array.from({ length: attempt }, () => unavailable),
      });
      expect(pageErrors).toHaveLength(attempt);
      for (const error of pageErrors) {
        expect(error).toMatch(/could not start in this browser:.*could not reserve \d+ bytes/u);
      }
      expect(page.workers()).toHaveLength(0);
      const requestedBytes = Number(pageErrors[0]?.match(/could not reserve (\d+) bytes/u)?.[1]);
      expect(requestedBytes).toBeGreaterThan(reservation.smallBytes);
      const fixedReservation = await page.evaluate((bytes) => {
        const pages = bytes / 65_536;
        try {
          const fixed = new WebAssembly.Memory({ initial: pages, maximum: pages });
          return { bytes: fixed.buffer.byteLength, failure: null };
        } catch (error) {
          return { bytes: null, failure: error instanceof Error ? { name: error.name, message: error.message } : null };
        }
      }, requestedBytes);
      expect(fixedReservation).toMatchObject({ bytes: null, failure: { name: "RangeError", message: expect.any(String) } });
      if (attempt === 2) {
        if (frames === null || typeof frames !== "object" || Array.isArray(frames)) {
          throw new Error("Native protocol observation did not retain its message envelope");
        }
        await memoryTest.info().attach("native-memory-reservation", {
          body: Buffer.from(
            JSON.stringify({ browser: browser.version(), reservation, requestedBytes, fixedReservation, outbound: frames["outbound"], pageErrors }),
          ),
          contentType: "application/json",
        });
      }
      expect(trpc.count("plugin.reportUiCrash")).toBe(0);
      expect(trpc.count("plugin.uiHostCall")).toBe(0);
      await expect(page.getByText("Native browser ready", { exact: true })).toHaveCount(0);
      if (attempt === 1) {
        const nextWorker = page.waitForEvent("worker");
        await retry.click();
        await nextWorker;
      }
    }
  },
);
