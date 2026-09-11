// CT: the TIER-C scripted plugin surface (plugin-ui-plane #679 U4, §4.6/§4.9) — the REAL QuickJS-WASM guest, in
// a REAL Web Worker, mounted through the REAL Plugins pane over a stubbed network. Nothing here is a double
// except the wire: the interpreter, the realm stripping, the wall-clock timer, the publish guard and the schema
// re-validation are all production code.
//
// THE THREE THINGS THIS FILE EXISTS TO PROVE, and each is a claim the design makes that nothing else checks:
//
//  1. ZERO NETWORK ON KEYSTROKE — the owner's own U4 done-criterion. A scripted surface filters a list as you
//     type, and the request count does not move. This is the ENTIRE reason Tier C exists; a Tier-S surface
//     would fire `invokeUiAction` per character. The count is taken AFTER a settled rendered barrier (the
//     narrowed list), never as a bare number — a node-side count is not a browser-side settle.
//  2. A HUNG GUEST COLLAPSES TO NULL WITHIN THE DEADLINE — the D46 review's P1-A lesson, inherited from birth.
//     A `while(true)` in an event handler cannot be preempted by the in-guest interrupt once it stops yielding,
//     so the HOST's wall-clock timer plus `worker.terminate()` is the only bound that holds. The surface must
//     disappear, and the crash must reach the 3-strike counter (`plugin.reportUiCrash`).
//  3. THE PUBLISH GUARD REFUSES A RE-RENDER LOOP — a guest that republishes an IDENTICAL tree on every event
//     must not re-mount the surface, or a `render`-in-`onEvent` guest becomes an infinite paint loop.
//
// WHY THE GUEST SOURCES ARE INLINE STRINGS: they are the untrusted input under test. A fixture file would be
// compiled/linted as if it were ours, and the hostile arms (an infinite loop, a tree that fails the schema) are
// precisely the shapes a linter would refuse to let us write.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginScriptedSurfaceStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };
const SCRIPTED_ID = castId<PluginId>("plugin_ct_scripted00001");
/** The WALL is `eventCpuMs + hostCallDeadlineMs` = 6 s (ui-guest-protocol.ts). The hung arm has to outlive it,
 *  plus the worker boot, so its barrier gets real room — a tighter timeout would flake on a cold WASM load
 *  rather than measuring the deadline. */
const HUNG_COLLAPSE_TIMEOUT_MS = 20_000;
/** Booting a WASM interpreter is not instant, and under CT contention it is less instant still. */
const GUEST_BOOT_TIMEOUT_MS = 15_000;
/** The F2 arm's post-fix window: once the pump preempts the boot loop at `eventCpuMs` (1 s) the worker is free
 *  and the queued click renders within a second or two. Generous for contention, yet well under the 30 s
 *  per-test default so the UNMODIFIED-source RED (where "pong" never comes) reports as a failure, never a
 *  SIGKILL. */
const BOOT_LOOP_PONG_TIMEOUT_MS = 12_000;

/** THE F3 REALM ALLOW-LIST (#784) — every name a client guest may enumerate on `globalThis` after `installRealm`,
 *  IDENTICAL to the server realm's pin (`tests/server/infra/plugin-host/realm.test.ts`): same quickjs-ng engine
 *  build, and the client adds `orb` exactly as the server does. The worker header CLAIMED this control existed
 *  and it did not (`installRealm`/`ui-guest-realm` were in zero test files) — the same blind spot by which
 *  `performance` shipped live on the server. A closed list is the ONLY shape that goes RED the day a quickjs-ng
 *  bump adds `crypto` / `Temporal` / `Atomics` / a timer to the guest; a "no ambient X" probe set cannot.
 *  Three classes: ES intrinsics, the neutralized ambient time/entropy stubs (`Date`/`Math`/`performance` — kept
 *  as throwing stubs so a guest can feature-detect), and the one installed entry (`orb`). */
const CLIENT_ALLOWED_GLOBALS: readonly string[] = [
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DOMException",
  "DataView",
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
  "parseFloat",
  "parseInt",
  "queueMicrotask",
  "undefined",
  "unescape",
  "Date",
  "Math",
  "performance",
  "orb",
];

/** An enabled installed row carrying the `ui.surface` grant — the row a scripted surface mounts inside. */
function enabledRow(id: PluginId, name: string): Record<string, unknown> {
  return {
    id,
    slug: "scripted-demo",
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface", "storage.kv"],
    grantedCapabilities: ["ui.surface", "storage.kv"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    consecutiveCrashes: 0,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** A `listSurfaces` row at the SCRIPTED tier: no `spec`, because the tree is computed in the browser. */
function scriptedSurface(pluginId: PluginId, id: string): Record<string, unknown> {
  return { pluginId, id, anchor: "settings", title: "Browse readings", tier: "scripted" };
}

/** Serve `ui.js` from the owner-gated bytes route, with the REAL response typing the route sets — the client
 *  fetches it as text, so an `octet-stream` body is exactly what production hands it. */
async function routeUiBundle(page: Parameters<typeof routeTrpc>[0], source: string): Promise<{ readonly hits: () => number }> {
  let hits = 0;
  await page.route("**/api/plugin-ui/**", async (route) => {
    hits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: { "X-Content-Type-Options": "nosniff" },
      body: source,
    });
  });
  return { hits: (): number => hits };
}

/** THE FILTER DEMO — the shipped affinity-tracker's shape, reduced to what the assertion needs: one host read
 *  at startup, then a local filter. This IS the `ui.js` pattern the seeded example teaches. */
const FILTER_GUEST = `
  const ui = orb.ui(1);
  let rooms = [];
  let query = "";
  function draw() {
    const needle = query.trim().toLowerCase();
    const matches = rooms.filter((r) => needle === "" || r.toLowerCase().includes(needle));
    ui.render("browser", {
      kind: "stack",
      children: [
        { kind: "textField", name: "q", label: "Filter rooms", value: query },
        { kind: "list", items: matches },
        { kind: "text", voice: "label", value: matches.length + " of " + rooms.length + " rooms" },
      ],
    });
  }
  ui.onEvent((e) => {
    if (e.event.type === "field" && e.event.name === "q") { query = e.event.value; draw(); }
  });
  draw();
  ui.host.storage.list("score:").then((keys) => { rooms = keys.map((k) => k.slice(6)); draw(); });
`;

// THE TWO HANG SHAPES, and they are NOT the same test — this file originally had only the first and it passed
// while proving the wrong thing (measured 2026-08-28: the reported reason was `InternalError: interrupted`,
// i.e. the IN-GUEST budget, with the host's wall-clock timer never involved). They are kept apart because they
// are contained by two different mechanisms, and only one of them is the P1-A lesson:
//
//  A. CPU-BOUND (`while(true)`) — still EXECUTING BYTECODE, so the QuickJS interrupt handler preempts it at
//     `eventCpuMs`. Fast, contained in-thread, and the cheap common case (a plugin author's accidental loop).
//  B. NON-EXECUTING (`await new Promise(() => {})`) — the guest has STOPPED running bytecode entirely, so the
//     interrupt handler is STRUCTURALLY BLIND to it (it only ever fires between instructions). Nothing inside
//     the worker can end this. The ONLY bound is the host's wall-clock timer on another thread plus
//     `worker.terminate()` — which is the whole reason the interpreter is in a worker, and the whole reason
//     `HOST_FN_DEADLINE_MS`-style settlement walls exist on the server half too.

/** A. The CPU-bound wedge — contained by the in-guest interrupt. */
const CPU_HUNG_GUEST = `
  const ui = orb.ui(1);
  ui.render("browser", { kind: "stack", children: [{ kind: "button", actionId: "go", label: "Wedge it" }] });
  ui.onEvent(() => { while (true) {} });
`;

/** B. The NON-EXECUTING wedge — the interrupt handler cannot see it; only the host's wall-clock kill ends it. */
const PARKED_HUNG_GUEST = `
  const ui = orb.ui(1);
  ui.render("browser", { kind: "stack", children: [{ kind: "button", actionId: "go", label: "Park it" }] });
  ui.onEvent(() => new Promise(() => {}));
`;

/** C. THE BOOT-TIME FIRE-AND-FORGET LOOP — the F2 gap (#784, the client twin of #781). A guest that fires a
 *  host call at BOOT without awaiting it, whose `.then` continuation loops. The fire-and-forget is DELIBERATELY
 *  NOT the script's last expression: `draw()` is, so the boot eval's completion value is `undefined`, boot's
 *  `runToSettlement` does NOT await the `.then` chain, and boot `ready`s + REMOVES its interrupt handler while the
 *  host call is still in flight. The continuation therefore settles LATER, on `ui-guest-realm`'s `pump()`, with
 *  the boot wall cleared and no handler armed. (If the `.then` were the last expression — the FILTER_GUEST shape
 *  — boot would await it under its OWN handler and the loop would be bounded by accident; that is why the naive
 *  arm passed and this ordering is load-bearing.) It is the shape the shipped affinity-tracker teaches
 *  (`void load();`) — benign there, a worker-pegging DoS here. `phase` lets the CT barrier on the pump having
 *  STARTED the continuation. */
const BOOT_LOOP_GUEST = `
  const ui = orb.ui(1);
  let phase = "idle";
  function draw() {
    ui.render("browser", { kind: "stack", children: [
      { kind: "button", actionId: "ping", label: "Ping" },
      { kind: "text", voice: "label", value: phase },
    ]});
  }
  ui.onEvent((e) => { if (e.event.type === "action" && e.event.actionId === "ping") { phase = "pong"; draw(); } });
  ui.host.storage.get("k").then(() => { phase = "resolved"; draw(); while (true) {} });
  draw();
`;

/** THE REALM PROBE (#784 F3) — it enumerates its OWN guest `globalThis` and renders the sorted list into a text
 *  node the CT reads back, so the closed allow-list is asserted against the REAL worker guest (the production
 *  path: the real wasm, the real `installRealm`). Wrapped in a marker so the CT can locate exactly this node. */
/** The string the client realm probe estimates — asserted against the SAME isomorphic `estimateTokens` the guest ran. */
const TOKENS_SAMPLE = "The quick brown fox jumps over the lazy dog.";

const REALM_PROBE_GUEST = `
  const ui = orb.ui(1);
  const names = Object.getOwnPropertyNames(globalThis).sort().join(",");
  ui.render("browser", { kind: "stack", children: [
    { kind: "text", voice: "label", value: "REALM_GLOBALS[" + names + "]" },
    // #788 F13 — prove the FREE token estimator is on the client realm floor and computes LOCALLY (no host round-trip).
    { kind: "text", voice: "label", value: "TOKENS[" + ui.tokens.count(${JSON.stringify(TOKENS_SAMPLE)}) + "]" },
  ]});
`;

/** THE LOOPING PUBLISHER — it republishes an IDENTICAL tree on every event. Without a content-equality guard
 *  this is an unbounded paint loop; with one it is a no-op after the first publish. */
const REPUBLISH_GUEST = `
  const ui = orb.ui(1);
  const tree = { kind: "stack", children: [{ kind: "text", value: "steady" }, { kind: "textField", name: "q", label: "Type here" }] };
  ui.onEvent(() => { ui.render("browser", tree); });
  ui.render("browser", tree);
`;

test("THE U4 DONE-CRITERION — a scripted surface filters a list with ZERO network on keystroke", async ({ mount, page }) => {
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(SCRIPTED_ID, "Scripted Demo")],
    "plugin.listSurfaces": () => [scriptedSurface(SCRIPTED_ID, "browser")],
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
    // The ONE host call this guest makes, and it makes it exactly once — at startup.
    "plugin.uiHostCall": () => ({ resultJson: JSON.stringify(["score:aurora", "score:beacon", "score:cinder"]) }),
  });
  await routeUiBundle(page, FILTER_GUEST);
  await mount(<PluginScriptedSurfaceStory />);

  // SETTLED BARRIER 1: the guest booted, made its read, and published a tree carrying all three rooms. The
  // count line is the honest barrier — it exists only after the startup read landed AND was re-published.
  await expect(page.getByText("3 of 3 rooms")).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  await expect(page.getByText("aurora")).toBeVisible();

  // THE MEASUREMENT. Taken AFTER a settled state, so it is a count of a finished world, not a race.
  const before = recorder.count("plugin.uiHostCall") + recorder.count("plugin.invokeUiAction") + recorder.count("plugin.getSurfaceState");

  // Type. Every character is a `postMessage` into the worker and nothing else.
  await page.getByRole("textbox", { name: "Filter rooms" }).fill("bea");

  // SETTLED BARRIER 2: the guest filtered LOCALLY and republished. "1 of 3 rooms" cannot exist unless the
  // keystroke reached the interpreter and its new tree came back through the schema and mounted.
  await expect(page.getByText("1 of 3 rooms")).toBeVisible();
  await expect(page.getByText("beacon")).toBeVisible();
  await expect(page.getByText("aurora")).toBeHidden();

  // THE CLAIM: not one request moved. This is what Tier C bought. Both counts sit BETWEEN two settled rendered
  // barriers ("3 of 3 rooms" and "1 of 3 rooms"), so the world is provably finished at each read — and the
  // assertion is that nothing moved between them, which a retrying poll structurally cannot express (it would
  // happily wait for a request to arrive, which is the opposite of the property).
  const after = recorder.count("plugin.uiHostCall") + recorder.count("plugin.invokeUiAction") + recorder.count("plugin.getSurfaceState");
  expect(after, "a keystroke must not touch the network").toBe(before);
  // …and the POSITIVE CONTROL that the counter can move at all: the startup read DID happen, so a zero delta
  // above is a real "nothing more fired" rather than a recorder that was never wired.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the "3 of 3 rooms" barrier cannot render before that startup read completed.
  expect(recorder.count("plugin.uiHostCall")).toBe(1);
});

/** Both hang arms share everything but the guest and the expected reason — the wiring, the boot barrier, the
 *  collapse barrier and the crash-report shape are the SAME contract, so they are asserted once. Returns the
 *  reported reason for the arm-specific assertion. */
async function drivesHangToCollapse(
  fixture: { mount: (el: React.ReactElement) => Promise<unknown>; page: Parameters<typeof routeTrpc>[0] },
  guest: string,
  label: string,
): Promise<string> {
  const { mount, page } = fixture;
  let crashes = 0;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(SCRIPTED_ID, "Wedging Demo")],
    "plugin.listSurfaces": () => [scriptedSurface(SCRIPTED_ID, "browser")],
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
    "plugin.reportUiCrash": () => {
      crashes += 1;
      return null;
    },
  });
  await routeUiBundle(page, guest);
  await mount(<PluginScriptedSurfaceStory />);

  // It BOOTS FINE — which is the point of both arms: the failure under test is not "a broken plugin never
  // appeared", it is "a working plugin wedged", and only the second shape exercises a containment mechanism.
  const wedge = page.getByRole("button", { name: label });
  await expect(wedge).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });

  await wedge.click();

  // THE COLLAPSE (§4.9): no spinner, no error card, no frozen widget — the surface is simply GONE. This also
  // proves the main thread survived: the same guest on the UI thread would have frozen the page and this
  // assertion could never have run at all.
  await expect(wedge).toBeHidden({ timeout: HUNG_COLLAPSE_TIMEOUT_MS });

  // …and the death was REPORTED, into the same counter a throwing server handler drives. A silent collapse
  // would leave a plugin that dies every mount flickering forever instead of auto-disabling.
  await expect.poll(() => crashes, { timeout: HUNG_COLLAPSE_TIMEOUT_MS }).toBeGreaterThan(0);
  // The poll above settled on `crashes > 0`, so the recorder provably HOLDS this call: the two reads below are
  // of a FINISHED record, not of a race.
  const reported = recorder.lastInput("plugin.reportUiCrash") as { pluginId: PluginId; surfaceId: string; reason: string };
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the `crashes > 0` poll above proves the call was recorded before this read.
  expect(reported.pluginId).toBe(SCRIPTED_ID);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled poll — the record exists and is final.
  expect(reported.surfaceId).toBe("browser");
  return reported.reason;
}

test("a CPU-BOUND hang is preempted by the in-guest budget, and the surface collapses to null", async ({ mount, page }) => {
  const reason = await drivesHangToCollapse({ mount, page }, CPU_HUNG_GUEST, "Wedge it");
  // The QuickJS INTERRUPT handler fired — this arm never reaches the host's wall-clock timer, and naming that
  // in the assertion is what keeps the two arms from silently becoming one test that proves half the story.
  expect(reason, "a bytecode-executing loop is caught in-guest, not by the host wall").toContain("interrupted");
});

test("THE P1-A LESSON — a NON-EXECUTING hang is killed by the HOST's wall-clock timer, which the in-guest budget cannot see", async ({ mount, page }) => {
  // `new Promise(() => {})` stops running bytecode entirely, so the interrupt handler is structurally blind to
  // it: nothing inside the worker can end this. Only the host's timer + `worker.terminate()` does — the exact
  // gap the D46 review's P1-A finding named on the server half, inherited here from birth.
  const reason = await drivesHangToCollapse({ mount, page }, PARKED_HUNG_GUEST, "Park it");
  expect(reason, "only the OUT-OF-THREAD wall can end a guest that stopped executing").toContain("did not respond");
});

test("THE F2 GAP — a BOOT-TIME fire-and-forget whose continuation loops is bounded by the pump's OWN interrupt handler, not left to peg the worker forever", async ({
  mount,
  page,
}) => {
  // The two hang arms above are EVENT-scoped: the host arms a wall on `deliverEvent`, so a wedged handler is
  // caught. This arm is the gap NEITHER covers — a host call fired at BOOT and NOT awaited, whose `.then` loops.
  // It settles AFTER `ready` cleared the wall (plugin-ui-guest-host.ts) and the boot `runToSettlement` removed
  // its interrupt handler (ui-guest.worker.ts), so `ui-guest-realm`'s `pump()` runs `executePendingJobs()` on the
  // looping continuation with NOTHING armed. RED-FIRST (against the unmodified source): the worker pegs forever,
  // the click below never processes, "pong" never renders — the surface freezes on its last tree while
  // `reportUiCrash` stays SILENT (the 3-strike counter blind). The fix arms an `eventCpuMs` deadline inside
  // `pump()` itself; the loop is preempted and the worker frees.
  let crashes = 0;
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(SCRIPTED_ID, "Boot-loop Demo")],
    "plugin.listSurfaces": () => [scriptedSurface(SCRIPTED_ID, "browser")],
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
    // The boot-time host call resolves; its `.then` (which loops) then runs on the pump.
    "plugin.uiHostCall": () => ({ resultJson: JSON.stringify(null) }),
    "plugin.reportUiCrash": () => {
      crashes += 1;
      return null;
    },
  });
  await routeUiBundle(page, BOOT_LOOP_GUEST);
  await mount(<PluginScriptedSurfaceStory />);

  // Boot settled: the Ping button rendered, `ready` cleared the wall, the boot interrupt handler was removed —
  // the stage is exactly as production leaves it after a benign boot.
  await expect(page.getByRole("button", { name: "Ping" })).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });

  // The boot host call resolved and the PUMP ran its continuation far enough to publish "resolved" — proof the
  // fire-and-forget's `.then` is now executing on the worker thread, which is where the `while(true)` lives.
  await expect(page.getByText("resolved")).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });

  // THE PROOF the pump bounded the loop: the worker came back and processed a FRESH event. Under the unmodified
  // pump this click sits behind a pegged thread forever and "pong" never comes.
  await page.getByRole("button", { name: "Ping" }).click();
  await expect(page.getByText("pong")).toBeVisible({ timeout: BOOT_LOOP_PONG_TIMEOUT_MS });

  // And the containment was SILENT — a bounded pump continuation is a preempted job, not a crash: the surface
  // stays alive and nothing was reported. (The BENIGN boot continuation still settling is the DONE-CRITERION
  // test above, whose `ui.host.storage.list(...).then(draw)` is exactly this shape without the loop.)
  expect(crashes, "a bounded pump continuation is preempted, not crashed").toBe(0);
});

test("the publish guard refuses a re-render loop — an identical republish is a no-op, and the surface stays alive", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(SCRIPTED_ID, "Republishing Demo")],
    "plugin.listSurfaces": () => [scriptedSurface(SCRIPTED_ID, "browser")],
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await routeUiBundle(page, REPUBLISH_GUEST);
  await mount(<PluginScriptedSurfaceStory />);

  const field = page.getByRole("textbox", { name: "Type here" });
  await expect(field).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });

  // Drive a burst of events, each of which republishes the SAME tree. Without the content-equality guard every
  // one re-mounts the tree, and a controlled input that re-mounts loses its own value mid-typing — so the
  // assertion below is not a proxy for the guard, it is the guard's user-visible consequence.
  await field.fill("abcdefgh");
  await expect(field).toHaveValue("abcdefgh");
  await expect(page.getByText("steady")).toBeVisible();
});

test("THE F3 PIN — the client guest global object is an EXACT allow-list (a new runtime global goes red here)", async ({ mount, page }) => {
  // The worker header CLAIMED "the realm allow-list is asserted by a test from birth" — it was not (#784 F3).
  // This closes it against the REAL worker guest: the guest enumerates its own `globalThis` and renders it, and
  // the assertion is the CLOSED SET, the only shape that goes red the day a quickjs-ng bump adds `crypto` /
  // `Temporal` / `Atomics` / a timer — the exact blind spot by which `performance` shipped live on the server.
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(SCRIPTED_ID, "Realm Probe Demo")],
    "plugin.listSurfaces": () => [scriptedSurface(SCRIPTED_ID, "browser")],
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await routeUiBundle(page, REALM_PROBE_GUEST);
  await mount(<PluginScriptedSurfaceStory />);

  // The guest rendered its global-object enumeration into the marker node.
  const marker = page.getByText(/^REALM_GLOBALS\[/);
  await expect(marker).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  const rendered = (await marker.textContent()) ?? "";
  const inner = rendered.replace(/^REALM_GLOBALS\[/, "").replace(/]$/, "");
  const actual = inner.split(",");

  // THE CLOSED-SET ASSERTION — an added or removed guest global fails HERE.
  expect(actual).toEqual([...CLIENT_ALLOWED_GLOBALS].sort());
  // POSITIVE CONTROL that the probe enumerated a live guest (a broken install would render an empty/bare list):
  // `orb` is the one installed entry and the enumeration is non-trivial.
  expect(actual).toContain("orb");
  expect(actual.length).toBeGreaterThan(40);

  // #788 F13 — the FREE token estimator on the client realm floor: the guest computed `orb.ui(1).tokens.count`
  // LOCALLY (no proxied host call) and it returns the SAME isomorphic `estimateTokens` value the host would.
  const tokensMarker = page.getByText(/^TOKENS\[/);
  await expect(tokensMarker).toHaveText(`TOKENS[${estimateTokens(TOKENS_SAMPLE)}]`);
});
