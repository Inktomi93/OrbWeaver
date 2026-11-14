// What a scripted plugin's interface code can reach from its global object is one reviewed list: the production plugin
// page boots a real guest bundle in its Worker, the guest enumerates its global chain and renders it, and a name the
// engine or the realm adds turns this file red until a reviewer adds it here. The page's document, storage and network
// stay out of the guest, which reaches the server only through its host bridge.
// @subject packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts
// @subject packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts
import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { makePluginRow, makePluginScriptedPage } from "@orb/testkit/node/helpers";
import { z } from "zod";
import type { PluginProtocolStory } from "./_ct-stories.tsx";

// The reviewed guest surface, one row per level of the global object's prototype chain: the global's own names, then
// `Object.prototype`'s. `Date` and `performance` are the realm's throwing stubs; `orb` is the one name the realm installs.
const GUEST_SURFACE: readonly (readonly string[])[] = [
  [
    "AggregateError",
    "Array",
    "ArrayBuffer",
    "BigInt",
    "BigInt64Array",
    "BigUint64Array",
    "Boolean",
    "DOMException",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "FinalizationRegistry",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "Function",
    "Infinity",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "InternalError",
    "Iterator",
    "JSON",
    "Map",
    "Math",
    "NaN",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "RangeError",
    "ReferenceError",
    "Reflect",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "Symbol",
    "Symbol(Symbol.toStringTag)",
    "SyntaxError",
    "TypeError",
    "URIError",
    "Uint16Array",
    "Uint32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "WeakMap",
    "WeakRef",
    "WeakSet",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "eval",
    "globalThis",
    "isFinite",
    "isNaN",
    "orb",
    "parseFloat",
    "parseInt",
    "performance",
    "queueMicrotask",
    "undefined",
    "unescape",
  ],
  [
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
  ],
];

// The page's document, storage and network, and the Worker's own messaging, which the guest must never hold. Checked
// apart from the list, so a reviewer who widens the list to admit one of these still meets a red.
const PAGE_AMBIENT = [
  "window",
  "self",
  "document",
  "parent",
  "top",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "cookieStore",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "navigator",
  "location",
  "postMessage",
  "importScripts",
  "BroadcastChannel",
  "setTimeout",
  "setInterval",
];

const SURFACE_TEXT = "surface:";
const BRIDGE_TEXT = "bridge:";
const LEDGER = "Realm ledger";

// The guest renders its global chain, then reads one stored value through its host bridge, the positive control that the
// guest still reaches the server through the one door it has.
const SOURCE = `const ui = orb.ui(1);
const names = (o) => [...Object.getOwnPropertyNames(o), ...Object.getOwnPropertySymbols(o).map(String)].sort();
const chain = [];
for (let o = globalThis; o !== null; o = Object.getPrototypeOf(o)) { chain.push(names(o)); }
const render = (bridge) => ui.render("protocol", { kind: "stack", children: [
  { kind: "text", value: ${JSON.stringify(SURFACE_TEXT)} + JSON.stringify(chain) },
  { kind: "text", value: ${JSON.stringify(BRIDGE_TEXT)} + bridge },
] });
render("waiting");
ui.host.storage.get("ledger").then((value) => render(value), (error) => render("refused " + error.message));`;

function knownPlugin<const T>(pluginId: PluginId, answer: T): (input: { readonly pluginId: PluginId }) => T | ReturnType<typeof trpcError> {
  return (input) => (input.pluginId === pluginId ? answer : trpcError({ code: "NOT_FOUND" }));
}

test("a scripted guest enumerates exactly the reviewed global surface, holds none of the page's document, storage or network, and reads through its host bridge", async ({
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
      input.pluginId === plugin.id && input.fn === "storage.get" && input.argsJson === '["ledger"]'
        ? { resultJson: JSON.stringify(LEDGER) }
        : trpcError({ code: "NOT_FOUND" }),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: SOURCE }));
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });

  await expect(page.getByText(`${BRIDGE_TEXT}${LEDGER}`, { exact: true })).toBeVisible();
  expect(trpc.count("plugin.uiHostCall")).toBe(1);
  const rendered = await page.getByText(SURFACE_TEXT).textContent();
  const surface = z.array(z.array(z.string())).parse(JSON.parse(z.string().parse(rendered).slice(SURFACE_TEXT.length)));
  expect(surface).toEqual(GUEST_SURFACE);
  expect(surface.flat().filter((name) => PAGE_AMBIENT.includes(name))).toEqual([]);

  // The Worker thread around the engine holds no network either: the worker deletes it once the engine has loaded.
  const [worker] = page.workers();
  if (worker === undefined) {
    throw new Error("the plugin page started no guest Worker");
  }
  expect(await worker.evaluate(() => ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].filter((name) => name in globalThis))).toEqual([]);
  expect(await worker.evaluate(() => typeof postMessage)).toBe("function");
});
