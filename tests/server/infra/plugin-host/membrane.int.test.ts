// The membrane's three mechanisms, each through a real guest's host call: the capability gate, the opaque chat handle
// and the self-bound limits (the argument budget, the deadline, the result cap and the in-flight cap). The dump depth
// guard and the string-argument check are part of the argument intake. A guest past its CPU window is ended at its
// next host call, whatever it spends its time on (D346).
// @subject packages/server/src/infra/plugin-host/membrane.ts
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginHostV1, PluginLogView } from "@orb/contracts/plugin";
import { HOST_FUNCTION_CAPABILITY, HostVersionError, PLUGIN_HOST_VERSIONS, PluginCapabilityError, PluginHostDeadlineError } from "@orb/contracts/plugin";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps, GuestRun, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import {
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_INVOCATION_CPU_MS,
  SNIPPET_WALL_MS,
} from "#server/infra/plugin-host/budgets.ts";

// Far past the membrane's dump depth guard, so the iterative pre-walk must refuse this argument.
const PAST_DEPTH_GUARD = 1000;

// `ctx.dump` serializes through the guest's JSON.stringify, which calls the root's `toJSON` before it walks
// anything. The guest records that call, so a materialization that ran before the guard refused is visible
// even when the refusal itself looks the same.
const DEEP_ARGUMENT = `
const h = orb.host(1);
(async () => {
  let deep = {};
  for (let i = 0; i < ${PAST_DEPTH_GUARD}; i++) { deep = { n: deep }; }
  let materialized = false;
  deep.toJSON = () => { materialized = true; return {}; };
  try { await h.chat.listMessages(h.chat.current(), deep); h.log.info("accepted"); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

const ORDINARY_ARGUMENT = `
const h = orb.host(1);
(async () => {
  const view = { order: { newest: true } };
  let materialized = false;
  view.toJSON = () => { materialized = true; return { order: { newest: true } }; };
  try { const rows = await h.chat.listMessages(h.chat.current(), { limit: 5, view }); h.log.info("listed:" + Array.isArray(rows)); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

test("a guest argument past the dump depth guard is refused without ever being materialized, and the runtime keeps serving", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => 0 });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  const deep = await caller.plugin.runSnippet({ chatId: room.id, code: DEEP_ARGUMENT });
  expect(deep.error).toBeUndefined();
  expect(deep.logLines).toEqual(["[info] refused:Error", "[info] materialized:false"]);

  // The positive control for the sentinel: an argument the guard admits is materialized through `toJSON`.
  const ordinary = await caller.plugin.runSnippet({ chatId: room.id, code: ORDINARY_ARGUMENT });
  expect(ordinary.error).toBeUndefined();
  expect(ordinary.logLines).toEqual(["[info] listed:true", "[info] materialized:true"]);
});

// `room` is the handle the host minted for this invocation. `keepHandle` holds it in the resident realm, so the next
// command can present a handle from an invocation that has ended; `earlierHandle` refuses on its own when it holds none.
const MEMBRANE_OPS = {
  listMessages: "(h, room) => h.chat.listMessages(room)",
  keepHandle: "(h, room) => { globalThis.kept = room; return null; }",
  earlierHandle:
    "async (h, room) => { if (typeof globalThis.kept !== 'string' || globalThis.kept === room) { throw new RangeError('no earlier handle'); } return await h.chat.listMessages(globalThis.kept); }",
  mintedHandle: "(h) => h.chat.listMessages(h.ids.mint())",
  chatIdHandle: "(h, room, a) => h.chat.listMessages(a.chatId)",
  readKey: "(h, room, a) => h.storage.get('k'.repeat(a.length))",
} as const satisfies GuestOps;

test("a host function whose capability is not granted refuses with the capability error, and a granted guest's same call answers", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const reader = await installGuest(root, owner, { slug: "chat-reader", capabilities: ["chat.read"] }, MEMBRANE_OPS);
  const keeper = await installGuest(root, owner, { slug: "kv-keeper", capabilities: ["chat.read", "storage.kv"] }, MEMBRANE_OPS);

  expect(await guestRunner({ root, caller: owner, pluginId: reader, chatId: null })("readKey", { length: 1 })).toEqual({
    ok: false,
    name: new PluginCapabilityError("storage.kv").name,
  });
  expect(await guestRunner({ root, caller: owner, pluginId: keeper, chatId: null })("readKey", { length: 1 })).toEqual({ ok: true, value: null });
});

test("a chat call refuses a fabricated handle, the raw chat id and a handle from an ended invocation, and answers the admitted one", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const room = (await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [] })).chat;
  const pluginId = await installGuest(root, owner, { slug: "handle-holder", capabilities: ["chat.read"] }, MEMBRANE_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: room.id });
  const refused = { ok: false, name: Error.name };

  expect(await run("listMessages")).toMatchObject({ ok: true });
  expect(await run("keepHandle")).toEqual({ ok: true, value: null });
  expect(await run("earlierHandle")).toEqual(refused);
  expect(await run("mintedHandle")).toEqual(refused);
  expect(await run("chatIdHandle", { chatId: room.id })).toEqual(refused);
});

test("a host call whose arguments pass the inbound byte budget is refused before it reaches the host, and one under it answers", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "kv-keeper", capabilities: ["storage.kv"] }, MEMBRANE_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  expect(await run("readKey", { length: HOST_FN_ARGS_MAX_BYTES / 2 })).toEqual({ ok: true, value: null });
  expect(await run("readKey", { length: HOST_FN_ARGS_MAX_BYTES + 1 })).toEqual({ ok: false, name: Error.name });
});

// Each loop catches everything a host call throws and never ends on its own, so only the CPU interrupt ends it.
// `refusalLoop` holds the in-flight cap, so all but the first calls are refused; `readLoop` passes a string each call.
const LOOPS = {
  busyLoop: "() => { for (;;) {} }",
  refusalLoop: "(h) => { for (;;) { try { h.storage.get(); } catch (e) {} } }",
  readLoop: "(h) => { for (;;) { try { h.log.info('x'); } catch (e) {} } }",
  ping: "(h) => h.storage.get('k')",
} as const satisfies GuestOps;
// Each loop is interrupted more than once, because where the interrupt lands in a loop's iteration varies by run.
const LOOP_RUNS = 4;
// Every run ends within its invocation wall; the busy-loop control and a ping follow each.
const LOOP_TEST_TIMEOUT_MS = (2 * LOOP_RUNS + 1) * (PLUGIN_INVOCATION_CPU_MS + HOST_FN_DEADLINE_MS);

test("a guest looping host calls it catches past its CPU window ends as a busy loop does, then serves the next call and retires cleanly", {
  tags: ["slow"],
  timeout: LOOP_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "looper", capabilities: ["storage.kv"] }, LOOPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  // A loop with no host call is ended by the interrupt alone: the outcome every loop below must share.
  const interrupted: unknown = await run("busyLoop").catch((error: unknown) => error);
  expect(interrupted).toBeInstanceOf(Error);
  expect(await run("ping")).toEqual({ ok: true, value: null });

  for (const loop of ["refusalLoop", "readLoop"] as const) {
    for (let attempt = 0; attempt < LOOP_RUNS; attempt += 1) {
      await expect(run(loop)).rejects.toEqual(interrupted);
      // A clean call between loops also resets the crash count that would otherwise disable the plugin.
      expect(await run("ping")).toEqual({ ok: true, value: null });
    }
  }

  // Retirement: the runtime is torn down and a fresh one serves; a failed teardown also fails the harness close.
  await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: false });
  await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: true });
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

// Guests whose time goes into host calls, or into their own callbacks a host read would run, past their window. Each
// never ends on its own. `a.spin` is enough work for a callback to hold nearly all of each loop step.
const PAST_WINDOW = {
  busyLoop: "() => { for (;;) {} }",
  ping: "(h) => h.storage.get('k')",
  largeValues: "(h, room, a) => { const s = 'x'.repeat(a.size); for (;;) { try { h.log.info(s); } catch (e) {} } }",
  errorSetter:
    "(h, room, a) => { Object.defineProperty(Error.prototype, 'message', { set() { for (let i = 0; i < a.spin; i++) {} }, get() { return ''; }, configurable: true }); for (;;) { try { orb.host(a.unserved); } catch (e) {} } }",
  slowToString: "(h, room, a) => { const value = { toString() { for (let i = 0; i < a.spin; i++) {} return 'x'; } }; for (;;) { h.log.info(value); } }",
  slowValueOf:
    "(h, room, a) => { const major = { valueOf() { for (let i = 0; i < a.spin; i++) {} return a.unserved; } }; for (;;) { try { orb.host(major); } catch (e) {} } }",
  catchesInterrupt: "() => { for (;;) { try { for (;;) {} } catch (e) {} } }",
  // The same counting step, once in one uninterrupted span and once split across spans between awaits.
  countsAlone: "() => { globalThis.alone = 0; for (;;) { globalThis.alone++; } }",
  spendsAcrossAwaits:
    "async (h, room, a) => { globalThis.spent = 0; for (;;) { await h.storage.get('k'); for (let i = 0; i < a.spin; i++) { globalThis.spent++; } } }",
  counts: "() => [globalThis.alone, globalThis.spent]",
  callsFromFinally: "(h) => { for (;;) { try { for (;;) {} } finally { h.log.info('finally'); continue; } } }",
  // One host call whose read runs many guest callbacks, each a heavy native in a loop, so one interrupt poll period
  // is long: past the window, each callback the host still runs costs a whole period.
  wideGetters:
    "(h, room, a) => { const arr = new Array(a.width).fill(0); const o = {}; for (let i = 0; i < a.count; i++) { Object.defineProperty(o, 'k' + i, { get() { for (;;) arr.slice(); }, enumerable: true }); } return h.storage.get(o); }",
  surfaceSetters:
    "(h, room, a) => { const arr = new Array(a.width).fill(0); for (const key of a.keys) { Object.defineProperty(Object.prototype, key, { set(v) { for (;;) arr.slice(); }, configurable: true }); } orb.host(1); return null; }",
} as const satisfies GuestOps;
// A slice wide enough that one poll period of a slicing loop is a large part of a window.
const SLICE_WIDTH = 10_000;
// Enough slow callbacks that running every one past the window overruns the margin many times over.
const SLOW_CALLBACKS = 60;
// Every key the host sets while it builds the surface `orb.host(1)` returns, each a namespace or a function name.
const SURFACE_KEYS = [...new Set(Object.keys(HOST_FUNCTION_CAPABILITY).flatMap((ref) => ref.split(".")))];
const CALLBACK_STEPS = 300_000;
const UNSERVED_HOST_VERSION = Math.max(...PLUGIN_HOST_VERSIONS) + 1;
// What an invocation may run past its window: the one host call already running at the deadline, the step to the next
// interrupt poll, and the broker round trip. One more window covers all three.
const PAST_WINDOW_MARGIN_MS = PLUGIN_INVOCATION_CPU_MS;
// The invocation wall bounds how long an invocation can hold its runtime, apart from the CPU account it spends: a guest
// that only waits on host calls spends almost none of it.
const INVOCATION_WALL_MS = PLUGIN_INVOCATION_CPU_MS + HOST_FN_DEADLINE_MS;
const SNIPPET_INVOCATION_WALL_MS = SNIPPET_WALL_MS + HOST_FN_DEADLINE_MS;
// A red run ends at its timeout instead; a green one needs about three invocation walls.
const PAST_WINDOW_TEST_TIMEOUT_MS = 4 * INVOCATION_WALL_MS;

test.for([
  { name: "a loop of argument-cap values", op: "largeValues", args: { size: HOST_FN_ARGS_MAX_BYTES } },
  {
    name: "a loop of refused host calls under a slow Error.prototype setter",
    op: "errorSetter",
    args: { spin: CALLBACK_STEPS, unserved: UNSERVED_HOST_VERSION },
  },
  { name: "a loop logging an object with a slow toString", op: "slowToString", args: { spin: CALLBACK_STEPS } },
  { name: "a loop passing a host call an object with a slow valueOf", op: "slowValueOf", args: { spin: CALLBACK_STEPS, unserved: UNSERVED_HOST_VERSION } },
  { name: "a loop that catches the interrupt", op: "catchesInterrupt", args: {} },
  { name: "a loop that calls the host from finally", op: "callsFromFinally", args: {} },
  { name: "one host call reading an argument with many slow getters", op: "wideGetters", args: { width: SLICE_WIDTH, count: SLOW_CALLBACKS } },
  {
    name: "one orb.host call building its surface under slow Object.prototype setters",
    op: "surfaceSetters",
    args: { width: SLICE_WIDTH, keys: SURFACE_KEYS },
  },
] as const)(
  "$name ends within the margin of its CPU window as a busy loop does, then serves the next call and retires cleanly",
  { tags: ["slow"], timeout: PAST_WINDOW_TEST_TIMEOUT_MS },
  async ({ op, args }) => {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const pluginId = await installGuest(root, owner, { slug: "overrunner", capabilities: ["storage.kv"] }, PAST_WINDOW);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
    const interrupted: unknown = await run("busyLoop").catch((error: unknown) => error);
    expect(interrupted).toBeInstanceOf(Error);
    expect(await run("ping")).toEqual({ ok: true, value: null });

    const started = performance.now();
    await expect(run(op, args)).rejects.toEqual(interrupted);
    expect(performance.now() - started).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
    expect(await run("ping")).toEqual({ ok: true, value: null });

    await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: false });
    await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: true });
    expect(await run("ping")).toEqual({ ok: true, value: null });
  },
);

// A `then` getter on `Object.prototype` that never returns: the host's settlement of any object result reads it.
const ENDLESS_THEN = "Object.defineProperty(Object.prototype, 'then', { get() { for (;;) {} }, configurable: true });";
const SETTLE_PATH = {
  busyLoop: "() => { for (;;) {} }",
  ping: "(h) => h.storage.get('k')",
  // Awaits nothing, so its whole invocation runs in one turn of the broker and no settlement can land inside it.
  idle: "() => null",
  thenAwaited: `async (h, room) => { ${ENDLESS_THEN} await h.chat.listMessages(room); return null; }`,
  thenFloated: `(h, room) => { ${ENDLESS_THEN} h.chat.listMessages(room); return null; }`,
} as const satisfies GuestOps;

// A snippet that only logs, and the lines it reads back: proof the snippet path still serves.
const NEXT_SNIPPET = "orb.host(1).log.info('next');";
const NEXT_SNIPPET_LINES = ["[info] next"];

// A resident guest, invoked in `chatId` when it has one; its log, read with no invocation; and its retirement: a
// disable, timed, then an enable.
async function residentGuest(
  root: ServerTestHarness,
  plugin: Parameters<typeof installGuest>[2],
  ops: GuestOps,
  chatId: Parameters<typeof guestRunner>[0]["chatId"],
): Promise<{ readonly run: GuestRun; readonly log: () => Promise<readonly PluginLogView[]>; readonly retire: () => Promise<number> }> {
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, plugin, ops);
  return {
    run: guestRunner({ root, caller: owner, pluginId, chatId }),
    log: () => root.services.plugin.getLog({ caller: owner, pluginId }),
    retire: async (): Promise<number> => {
      const started = performance.now();
      await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: false });
      const disabledMs = performance.now() - started;
      await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: true });
      return disabledMs;
    },
  };
}

async function settlePathGuest(root: ServerTestHarness): ReturnType<typeof residentGuest> {
  const room = (await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [] })).chat;
  return await residentGuest(root, { slug: "then-getter", capabilities: ["chat.read", "storage.kv"] }, SETTLE_PATH, room.id);
}

test("a resident guest awaiting a host result under an endless then getter is ended by its wall, then served and retired", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { run, retire } = await settlePathGuest(root);

  // An ended guest's failure, the shape the wall's must share.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }

  // The interrupt stops the settlement inside the getter, so the guest's await never resumes and the wall ends it.
  const started = performance.now();
  await expect(run("thenAwaited")).rejects.toMatchObject({ name: ended.name, code: ended.code });
  expect(performance.now() - started).toBeLessThan(INVOCATION_WALL_MS + PAST_WINDOW_MARGIN_MS);
  await retire();
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

test("a resident guest that floats a host call under an endless then getter frees its runtime within a window", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { run, retire } = await settlePathGuest(root);

  const started = performance.now();
  expect(await run("thenFloated")).toEqual({ ok: true, value: null });
  // The floated call settles after the command returned; the next command waits at most for that settlement's span.
  expect(await run("idle")).toEqual({ ok: true, value: null });
  expect(performance.now() - started).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  await retire();
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

test("a snippet awaiting a host result under an endless then getter is ended by its wall, and the next snippet runs", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  // The first snippet pays the broker's start, which no timed run below may carry.
  expect(await caller.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });

  const started = performance.now();
  const ended = await caller.plugin.runSnippet({
    chatId: room.id,
    code: `const h = orb.host(1); ${ENDLESS_THEN} (async () => { await h.chat.listMessages(h.chat.current()); })();`,
  });
  expect(ended.error).toBeDefined();
  expect(performance.now() - started).toBeLessThan(SNIPPET_INVOCATION_WALL_MS + PAST_WINDOW_MARGIN_MS);
  expect(await caller.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });
});

test("a snippet building its surface under slow Object.prototype setters reports the refusal, never success", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  const code = `const arr = new Array(${String(SLICE_WIDTH)}).fill(0);
for (const key of ${JSON.stringify(SURFACE_KEYS)}) { Object.defineProperty(Object.prototype, key, { set(v) { for (;;) arr.slice(); }, configurable: true }); }
orb.host(1);`;

  expect(await caller.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });
  // A busy loop's snippet: its refusal, and its time to the end of its account, which carries the same runtime
  // acquisition and load as the run measured against it.
  const busyStarted = performance.now();
  const busy = await caller.plugin.runSnippet({ chatId: room.id, code: "for (;;) {}" });
  const busyMs = performance.now() - busyStarted;
  expect(busy.error).toBeDefined();

  const started = performance.now();
  const result = await caller.plugin.runSnippet({ chatId: room.id, code });
  expect(result.error).toBe(busy.error);
  expect(performance.now() - started).toBeLessThan(busyMs + PAST_WINDOW_MARGIN_MS);
  expect(await caller.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });
});

// Each guest reads a host refusal or a host read under accessors that count every call; reverting any of the three
// reads that leave guest code alone (the host-built error, the log's kind-only text, the number-only version read)
// makes a count non-zero.
const NO_GUEST_CODE = {
  errorAccessors:
    "(h, room, a) => { let hits = 0; for (const key of ['message', 'name']) { Object.defineProperty(Error.prototype, key, { get() { hits++; return ''; }, set(v) { hits++; }, configurable: true }); } try { orb.host(a.unserved); return ['returned']; } catch (e) { return [Object.getOwnPropertyDescriptor(e, 'name')?.value ?? null, Object.getOwnPropertyDescriptor(e, 'message')?.value ?? null, hits]; } }",
  logsObject: "(h) => { let calls = 0; h.log.info({ toString() { calls++; return 'x'; } }); return calls; }",
  versionObject: "(h, room, a) => { let calls = 0; try { orb.host({ valueOf() { calls++; return a.unserved; } }); } catch (e) {} return calls; }",
} as const satisfies GuestOps;

test("a host refusal and the host's reads of a guest value run none of the guest's accessors", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "accessor-counter", capabilities: [] }, NO_GUEST_CODE);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  const refusal = new HostVersionError(UNSERVED_HOST_VERSION, PLUGIN_HOST_VERSIONS);

  expect(await run("errorAccessors", { unserved: UNSERVED_HOST_VERSION })).toEqual({ ok: true, value: [refusal.name, refusal.message, 0] });
  expect(await run("logsObject")).toEqual({ ok: true, value: 0 });
  expect(await run("versionObject", { unserved: UNSERVED_HOST_VERSION })).toEqual({ ok: true, value: 0 });
});

// Each span between awaits spends a share of the invocation's CPU account; ten callbacks' worth keeps the awaits a
// small part of the run.
const SPAN_STEPS = 10 * CALLBACK_STEPS;
// The work one account may hold, against one uninterrupted window's: the margin is one more window.
const ACCOUNT_WORK_RATIO_MAX = (PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS) / PLUGIN_INVOCATION_CPU_MS;

test("a guest that spends its CPU across many awaits gets one account's work, not a window per await", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "spender", capabilities: ["storage.kv"] }, PAST_WINDOW);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  // Neither loop returns. The interrupt stops the continuation of the spender inside a pump, which leaves its promise
  // unsettled, so that invocation ends at the wall: its work, not its end, shows the account. One run cannot carry
  // both counts, because the first loop spends the account the second would be measured against; the baseline is
  // taken on both sides of the spender instead, and the larger kept, so load that rises during one run cannot shrink it.
  const counts = async (): Promise<readonly number[]> => {
    const counted = await run("counts");
    if (!(counted.ok && Array.isArray(counted.value))) {
      throw new Error("the guest kept both counts");
    }
    return counted.value.map(Number);
  };
  await run("countsAlone").catch(() => undefined);
  const [aloneBefore = 0] = await counts();
  await run("spendsAcrossAwaits", { spin: SPAN_STEPS }).catch(() => undefined);
  await run("countsAlone").catch(() => undefined);
  const [aloneAfter = 0, spent = 0] = await counts();
  expect(spent).toBeGreaterThan(0);
  expect(spent).toBeLessThan(ACCOUNT_WORK_RATIO_MAX * Math.max(aloneBefore, aloneAfter));
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

// Every place the storage and variables functions take a string, called once with an array there and once with the
// string itself. `written` reads back both stores, so a refused write is seen to leave them empty.
const STRING_ARGUMENTS = [
  { site: "storage.get key", refused: "(h) => h.storage.get(['k'])", accepted: "(h) => h.storage.get('k')" },
  { site: "storage.set key", refused: "(h) => h.storage.set(['k'], 'v')", accepted: "(h) => h.storage.set('k', 'v')" },
  { site: "storage.set value", refused: "(h) => h.storage.set('k', ['v'])", accepted: "(h) => h.storage.set('k', 'v')" },
  {
    site: "storage.compareAndSet key",
    refused: "(h) => h.storage.compareAndSet(['k'], null, 'v')",
    accepted: "(h) => h.storage.compareAndSet('k', null, 'v')",
  },
  {
    site: "storage.compareAndSet expected value",
    refused: "(h) => h.storage.compareAndSet('k', ['x'], 'v')",
    // An omitted precondition is the contract's create, the same as `null`.
    accepted: "(h) => h.storage.compareAndSet('k', undefined, 'v')",
  },
  {
    site: "storage.compareAndSet next value",
    refused: "(h) => h.storage.compareAndSet('k', null, ['v'])",
    accepted: "(h) => h.storage.compareAndSet('k', null, 'v')",
  },
  { site: "storage.delete key", refused: "(h) => h.storage.delete(['k'])", accepted: "(h) => h.storage.delete('k')" },
  { site: "variables.get key", refused: "(h) => h.variables.get(['k'])", accepted: "(h) => h.variables.get('k')" },
  { site: "variables.set key", refused: "(h) => h.variables.set(['k'], 'v')", accepted: "(h) => h.variables.set('k', 'v')" },
  { site: "variables.set value", refused: "(h) => h.variables.set('k', ['v'])", accepted: "(h) => h.variables.set('k', 'v')" },
  { site: "variables.delete key", refused: "(h) => h.variables.delete(['k'])", accepted: "(h) => h.variables.delete('k')" },
] as const;

test.for(STRING_ARGUMENTS)(
  "the $site refuses a non-string at the door and writes nothing; the string answers",
  { tags: ["slow"] },
  async ({ refused, accepted }) => {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const ops = { refused, accepted, written: "async (h) => [(await h.storage.list()).length, await h.variables.get('k')]" } satisfies GuestOps;
    const pluginId = await installGuest(root, owner, { slug: "string-taker", capabilities: ["storage.kv", "global_vars"] }, ops);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

    expect(await run("refused")).toEqual({ ok: false, name: Error.name });
    expect(await run("written")).toEqual({ ok: true, value: [0, null] });
    expect(await run("accepted")).toMatchObject({ ok: true });
  },
);

// The remote end of a guest's `net.fetch`, the external edge. `/held` answers only once released and gives up when its
// request is aborted; `/body` answers `quotes` double quotes then `tail` letters, a body whose JSON doubles per quote.
const NET_HOST = "peer.test";
const HELD_URL = `https://${NET_HOST}/held`;
const NOW_URL = `https://${NET_HOST}/now`;
const bodyUrl = (quotes: number, tail: number): string => `https://${NET_HOST}/body?quotes=${String(quotes)}&tail=${String(tail)}`;

interface ScriptedRemote {
  readonly fetch: typeof fetch;
  readonly release: () => void;
}

function scriptedRemote(): ScriptedRemote {
  const gate = Promise.withResolvers<void>();
  return {
    release: () => gate.resolve(),
    fetch: (input, init): Promise<Response> => {
      const url = new URL(new Request(input, init).url);
      if (url.pathname === new URL(HELD_URL).pathname) {
        const signal = init?.signal;
        const aborted = new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("the held request was aborted", { cause: signal.reason })), { once: true });
        });
        return Promise.race([gate.promise.then(() => new Response("held")), aborted]);
      }
      if (url.pathname === new URL(NOW_URL).pathname) {
        return Promise.resolve(new Response("now"));
      }
      const quotes = Number(url.searchParams.get("quotes"));
      const tail = Number(url.searchParams.get("tail"));
      return Promise.resolve(new Response(`${'"'.repeat(quotes)}${"a".repeat(tail)}`, { headers: { "content-type": "text/plain" } }));
    },
  };
}

const NET_OPS = {
  status: "async (h, room, a) => (await h.net.fetch(a.url)).status",
  bodyLength: "async (h, room, a) => (await h.net.fetch(a.url)).body.length",
  flood:
    "async (h, room, a) => { globalThis.held = Array.from({ length: a.max }, () => h.net.fetch(a.url).then((r) => r.status, (e) => e.name)); return (await h.net.fetch(a.url)).status; }",
  drain: "() => Promise.all(globalThis.held)",
  waitsOnly: "async (h, room, a) => { for (;;) { try { await h.net.fetch(a.url); } catch (e) {} } }",
  busyLoop: "() => { for (;;) {} }",
} as const satisfies GuestOps;

async function netGuest(root: ServerTestHarness): Promise<ReturnType<typeof guestRunner>> {
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "net-caller", capabilities: ["net.fetch"], netHosts: [NET_HOST] }, NET_OPS);
  return guestRunner({ root, caller: owner, pluginId, chatId: null });
}

test("a host call still running at the deadline rejects with the deadline error, and one that answers sooner resolves", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  using _released = { [Symbol.dispose]: remote.release };
  const run = await netGuest(root);

  // No door shortens `HOST_FN_DEADLINE_MS`: this call waits the production deadline in real time.
  expect(await run("status", { url: HELD_URL })).toEqual({ ok: false, name: PluginHostDeadlineError.name });
  expect(await run("status", { url: NOW_URL })).toEqual({ ok: true, value: 200 });
});

test("a guest that only waits on host calls is ended at the invocation wall, and the next call is served", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  using _released = { [Symbol.dispose]: remote.release };
  const run = await netGuest(root);

  // An ended guest's failure, the shape the wall's must share.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }

  // No door shortens the wall: this waits the production wall in real time.
  const started = performance.now();
  await expect(run("waitsOnly", { url: HELD_URL })).rejects.toMatchObject({ name: ended.name, code: ended.code });
  const elapsed = performance.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(INVOCATION_WALL_MS);
  expect(elapsed).toBeLessThan(INVOCATION_WALL_MS + PAST_WINDOW_MARGIN_MS);
  expect(await run("status", { url: NOW_URL })).toEqual({ ok: true, value: 200 });
});

test("a host result exactly at the result cap crosses, and one byte more is refused", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  const run = await netGuest(root);
  // Each quote serializes to two bytes, so the body fills what the `{status, body}` wrapper leaves of the cap.
  const emptyResult: Awaited<ReturnType<PluginHostV1["net"]["fetch"]>> = { status: 200, body: "" };
  const room = HOST_FN_RESULT_CAP_BYTES - Buffer.byteLength(JSON.stringify(emptyResult), "utf8");
  const quotes = Math.floor(room / 2);
  const tail = room - quotes * 2;

  expect(await run("bodyLength", { url: bodyUrl(quotes, tail) })).toEqual({ ok: true, value: quotes + tail });
  expect(await run("bodyLength", { url: bodyUrl(quotes, tail + 1) })).toEqual({ ok: false, name: Error.name });
});

test("the in-flight cap admits its number of concurrent host calls and refuses one more", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  const run = await netGuest(root);

  expect(await run("flood", { url: HELD_URL, max: HOST_CALLS_IN_FLIGHT_MAX })).toEqual({ ok: false, name: Error.name });
  remote.release();
  expect(await run("drain")).toEqual({ ok: true, value: Array.from({ length: HOST_CALLS_IN_FLIGHT_MAX }, () => 200) });
});

// Guests whose command returns at once and whose work goes on in continuations the host runs outside any invocation.
const OUTSIDE = {
  busyLoop: "() => { for (;;) {} }",
  idle: "() => null",
  ping: "(h) => h.storage.get('k')",
  // Each continuation logs a line, calls the host, then spins until the interrupt ends it.
  hostChain:
    "(h, room, a) => { const loop = () => { h.log.info(a.line); h.storage.get('k').then(loop, loop); for (;;) {} }; h.storage.get('k').then(loop, loop); return null; }",
  // Each continuation calls a function the guest was not granted, whose refusal settles with no I/O.
  refusedChain: "(h, room, a) => { const loop = () => { h.net.fetchAsset(a.url).catch(loop); }; loop(); return null; }",
  // One continuation starts strands of microtasks that never call the host. The interrupt ends the strand it lands in,
  // so the rest stay queued for whichever pump comes next, and every other floated call's settlement pumps again.
  microtaskChain:
    "(h, room, a) => { const spin = () => { Promise.resolve().then(spin); }; h.storage.get('k').then(() => { for (let i = 0; i < a.pumps + 2; i++) { spin(); } }); for (let i = 0; i < a.pumps; i++) { h.storage.get('k'); } return null; }",
} as const satisfies GuestOps;
// Settlements after the first that would each buy a fresh window without one account for work outside invocations.
const EXTRA_PUMPS = 4;
// Long enough for a chain charged a window per settlement to run several of them.
const OUTSIDE_RUN_MS = 4 * PLUGIN_INVOCATION_CPU_MS;
const CYCLE_LINE = "cycle";

test("a chain of host calls after its command returns spends one budget, and the next invocation resumes it on its own account", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { run, log, retire } = await residentGuest(root, { slug: "host-chain", capabilities: ["storage.kv"] }, OUTSIDE, null);
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }

  expect(await run("hostChain", { line: CYCLE_LINE })).toEqual({ ok: true, value: null });
  await sleep(OUTSIDE_RUN_MS);
  // One continuation spent the account and was interrupted. The call it made settled into a spent account, so the
  // next continuation stays queued however long nothing invokes the guest.
  expect((await log()).filter(({ message }) => message === CYCLE_LINE)).toHaveLength(1);

  // The next invocation's own pump runs the queued continuation first, inside its synchronous run, which spends that
  // invocation's account before the command's result can settle; the wall, which starts after that run, ends it.
  const started = performance.now();
  await expect(run("idle")).rejects.toMatchObject({ name: ended.name, code: ended.code });
  expect(performance.now() - started).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + INVOCATION_WALL_MS + PAST_WINDOW_MARGIN_MS);
  expect(await retire()).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

test("a chain through refused host calls after its command returns stops within one budget, and the next command and a disable are served", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { run, retire } = await residentGuest(root, { slug: "refused-chain", capabilities: ["storage.kv"] }, OUTSIDE, null);

  const started = performance.now();
  expect(await run("refusedChain", { url: HELD_URL })).toEqual({ ok: true, value: null });
  expect(await run("idle")).toEqual({ ok: true, value: null });
  expect(performance.now() - started).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  expect(await retire()).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  expect(await run("ping")).toEqual({ ok: true, value: null });
});

test("a microtask chain that never calls the host stops within one budget after its command returns", {
  tags: ["slow"],
  timeout: PAST_WINDOW_TEST_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { run, retire } = await residentGuest(root, { slug: "microtask-chain", capabilities: ["storage.kv"] }, OUTSIDE, null);

  const started = performance.now();
  expect(await run("microtaskChain", { pumps: EXTRA_PUMPS })).toEqual({ ok: true, value: null });
  // The outside account's one budget, then this command's own, whose pump runs the parked strands on its account.
  expect(await run("idle")).toEqual({ ok: true, value: null });
  expect(performance.now() - started).toBeLessThan(2 * PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  expect(await retire()).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PAST_WINDOW_MARGIN_MS);
  expect(await run("ping")).toEqual({ ok: true, value: null });
});
