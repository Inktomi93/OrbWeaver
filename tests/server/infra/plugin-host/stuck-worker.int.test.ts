// @subject packages/server/src/infra/plugin-host/broker-entry.ts
// A guest picks how long one native call or one interrupt poll period runs, so the CPU window cannot end it; the
// broker terminates that one Worker instead (D347). Every other runtime, any owner's, keeps serving, and a teardown a
// plugin did not cause is never a strike against it.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginStatus } from "@orb/contracts/plugin";
import { brandedId, createIdSource } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { systemTimers } from "@orb/server/infra/timers";
import { createFrozenClock, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { GuestRun, NativeServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { SNIPPET_CONCURRENCY_PER_USER } from "#server/domain/plugin/substrate/snippet-gate.ts";
import {
  EVENT_QUEUE_DEPTH,
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_DEADLINE_MS,
  PLUGIN_COMMAND_CPU_BUDGET_MS,
  PLUGIN_COMMAND_TIMEOUT_MS,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_RESIDENT_LIMITS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
  SNIPPET_WALL_MS,
  settlementWallMs,
} from "#server/infra/plugin-host/budgets.ts";
import { PLUGIN_BROKER_SYNC_TIMEOUT_MS } from "#server/infra/plugin-host/process-protocol.ts";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  firstChild,
  hasOperation,
  installGuest as installNativeGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
  PLUGIN_PROCESS_OPERATIONS,
} from "./process-runtime.fixtures.ts";

// Production timers and the monotonic clock they run on; the wall clock stays frozen, since no bound here reads it.
const NATIVE_TIME = { now: createFrozenClock().now, monotonicNow: (): number => performance.now(), timers: systemTimers };
// One string search whose cost is (haystack − needle) × needle: minutes, far past the parent's snippet backstop,
// with no interrupt poll inside it.
const NATIVE_STALL = "'a'.repeat(400000).indexOf('a'.repeat(100000) + 'b');";
// A loop whose one interrupt poll period, a wide slice per step, runs far past the parent's snippet backstop.
const POLL_GAP_STALL = "const wide = new Array(600000).fill(0); for (;;) wide.slice();";
// How long past its window the broker may take to end a stuck Worker: the overrun allowance, one check, and one window
// of slack for the termination and the replies.
const END_MARGIN_MS = PLUGIN_WORKER_OVERRUN_MAX_MS + PLUGIN_WORKER_SPAN_CHECK_MS + PLUGIN_INVOCATION_CPU_MS;
// A red run waits for the parent's own timeouts instead; a green one ends within a busy loop and two stalls.
const STALL_TEST_TIMEOUT_MS = 4 * (SNIPPET_WALL_MS + END_MARGIN_MS);
const BYSTANDER_HANDLE = brandedId("Handle").parse("bystander");
const ENABLED = "enabled" satisfies PluginStatus;
const NEXT_SNIPPET = "orb.host(1).log.info('next');";
const NEXT_SNIPPET_LINES = ["[info] next"];

// A root on production timers, so the parent's command backstop runs as it does in production, and a second owner
// whose resident plugin answers a ping and reports its status.
async function rootWithBystander(remote?: typeof fetch): Promise<
  AsyncDisposable & {
    readonly root: NativeServerTestHarness;
    readonly ping: () => ReturnType<GuestRun>;
    readonly bystanderStatus: () => Promise<PluginStatus | undefined>;
  }
> {
  await using stack = new AsyncDisposableStack();
  const seed = stack.use(await createServerHarness({ startJobs: false }));
  const bystanderId = await seed.app.sessions.ensureUser(BYSTANDER_HANDLE);
  const root = stack.use(
    await createServerHarness({
      db: seed.db,
      ownerId: seed.ownerId,
      idSource: createIdSource(),
      startJobs: false,
      pluginSpawn: spawn,
      time: NATIVE_TIME,
      ...(remote === undefined ? {} : { networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote } }),
    }),
  );
  const bystander = await root.principalFor(bystanderId);
  const pluginId = await installGuest(root, bystander, { slug: "bystander", capabilities: ["storage.kv"] }, { ping: "(h) => h.storage.get('k')" });
  const run = guestRunner({ root, caller: bystander, pluginId, chatId: null });
  const owned = stack.move();
  return {
    root,
    ping: () => run("ping"),
    bystanderStatus: async () => (await root.services.plugin.list({ caller: bystander })).find(({ id }) => id === pluginId)?.status,
    [Symbol.asyncDispose]: () => owned.disposeAsync(),
  };
}

test.for([
  { name: "one native call", code: NATIVE_STALL },
  { name: "one long interrupt poll period", code: POLL_GAP_STALL },
] as const)(
  "a snippet stuck in $name ends alone at its deadline, and another owner's resident plugin answers during and after, still enabled",
  { tags: ["slow"], timeout: STALL_TEST_TIMEOUT_MS },
  async ({ code }) => {
    await using owners = await rootWithBystander();

    expect(await owners.ping()).toEqual({ ok: true, value: null });

    const member = await owners.root.internalCallerFor(owners.root.ownerId);
    const room = (await member.chat.startChat({ characterIds: [] })).chat;
    // A busy loop's snippet ends at its window: its time carries the same Worker start and load as the stalled run.
    const busyStarted = performance.now();
    expect((await member.plugin.runSnippet({ chatId: room.id, code: "for (;;) {}" })).error).toBeDefined();
    const busyMs = performance.now() - busyStarted;

    const started = performance.now();
    const stuck = member.plugin.runSnippet({ chatId: room.id, code });
    await sleep(SNIPPET_WALL_MS);
    expect(await owners.ping()).toEqual({ ok: true, value: null });
    const ended = await stuck;
    expect(ended.error).toBeDefined();
    expect(ended).toMatchObject({ logLines: [], errorKind: "runtime" });
    expect(performance.now() - started).toBeLessThan(busyMs + END_MARGIN_MS);

    expect(await owners.ping()).toEqual({ ok: true, value: null });
    expect(await member.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });
    expect(await owners.bystanderStatus()).toBe(ENABLED);
  },
);

test("one member's snippets all stuck at once leave a Worker for another owner, whose plugin answers while every one is still running", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await rootWithBystander();
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  const member = await owners.root.internalCallerFor(owners.root.ownerId);
  const room = (await member.chat.startChat({ characterIds: [] })).chat;

  // The member's whole snippet allowance, each stuck until the broker ends its Worker.
  let settled = 0;
  const stuck = Array.from({ length: SNIPPET_CONCURRENCY_PER_USER }, () =>
    member.plugin.runSnippet({ chatId: room.id, code: NATIVE_STALL }).finally(() => {
      settled += 1;
    }),
  );
  await sleep(SNIPPET_WALL_MS);
  // The other owner is served now, not when the member's first Worker ends.
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  expect(settled).toBe(0);

  for (const ended of await Promise.all(stuck)) {
    expect(ended).toMatchObject({ logLines: [], errorKind: "runtime" });
  }
  expect(await owners.bystanderStatus()).toBe(ENABLED);
});

const SEARCH_NEEDLE = 20_000;
// One string search that runs several seconds with one interrupt poll, sized by its haystack.
const searchFor = (haystack: number): string => `'a'.repeat(${String(haystack)}).indexOf('a'.repeat(${String(SEARCH_NEEDLE)}) + 'b');`;
// About 8 s, 12 s, 4 s and half a second on this box: each settlement's getter, each run's own stall.
const SNIPPET_GETTER_SEARCH = searchFor(120_000);
const SNIPPET_MAIN_SEARCH = searchFor(170_000);
const COMMAND_GETTER_SEARCH = searchFor(70_000);
const COMMAND_MAIN_SEARCH = searchFor(26_000);
// Floated host calls whose results settle through the getter: enough that their spans, each under the one-span bound,
// add up past the command's budget.
const SNIPPET_FLOATED_CALLS = 4;

test("a snippet that stacks settlement spans, each under the one-span bound, ends before the parent's backstop, and another owner's resident plugin answers during and after", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await rootWithBystander();
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  const member = await owners.root.internalCallerFor(owners.root.ownerId);
  const room = (await member.chat.startChat({ characterIds: [] })).chat;
  const code = `const h = orb.host(1);
Object.defineProperty(Object.prototype, 'then', { get() { ${SNIPPET_GETTER_SEARCH} return undefined; }, configurable: true });
const calls = Array.from({ length: ${String(SNIPPET_FLOATED_CALLS)} }, () => h.chat.listMessages(h.chat.current()));
${SNIPPET_MAIN_SEARCH}
Promise.all(calls).then(() => undefined);`;

  const started = performance.now();
  const stacked = member.plugin.runSnippet({ chatId: room.id, code });
  await sleep(SNIPPET_WALL_MS);
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  // The snippet answers as one the host ended, not as a broker the parent killed.
  expect(await stacked).toMatchObject({ logLines: [], errorKind: "runtime" });
  expect(performance.now() - started).toBeLessThan(PLUGIN_COMMAND_TIMEOUT_MS.snippet);

  expect(await owners.ping()).toEqual({ ok: true, value: null });
  expect(await owners.bystanderStatus()).toBe(ENABLED);
});

const STACKED_OPS = {
  busyLoop: "() => { for (;;) {} }",
  mark: "() => { globalThis.mark = true; return null; }",
  marked: "() => globalThis.mark === true",
  stacked: `(h, room, a) => { Object.defineProperty(Object.prototype, 'then', { get() { ${COMMAND_GETTER_SEARCH} return undefined; }, configurable: true }); const calls = Array.from({ length: a.calls }, () => h.storage.list('')); ${COMMAND_MAIN_SEARCH} return Promise.all(calls).then(() => null); }`,
} as const;

// The guest work one invoke may spend across its spans before the broker ends its Worker, read up to two checks late.
const INVOKE_TOTAL_BOUND_MS = PLUGIN_COMMAND_CPU_BUDGET_MS.invoke + PLUGIN_WORKER_OVERRUN_MAX_MS + 2 * PLUGIN_WORKER_SPAN_CHECK_MS;
// How long the test holds one synchronous seam call at the parent, keeping a span open with no guest CPU and so at the
// same length on any load: two held spans pass one invoke's total bound, and one stays inside the broker's own wait for
// a seam answer and inside one span's bound.
const HELD_SPAN_MS = (INVOKE_TOTAL_BOUND_MS / 2 + PLUGIN_BROKER_SYNC_TIMEOUT_MS) / 2;
const HELD_OPS = {
  busyLoop: "() => { for (;;) {} }",
  mark: "() => { globalThis.mark = true; return null; }",
  marked: "() => globalThis.mark === true",
  held: "(h) => h.ids.mint()",
  // Floats a host read and returns; when the read settles, after the command answered, its `then` getter waits on a
  // seam call in a span on the outside account.
  floatHeld:
    "(h) => { let fired = false; Object.defineProperty(Array.prototype, 'then', { get() { if (!fired) { fired = true; h.ids.mint(); } return undefined; }, configurable: true }); h.storage.list(''); return null; }",
} as const;
const HELD_SEAM_CALL = (value: unknown): boolean => hasOperation(value, PLUGIN_PROCESS_OPERATIONS.mint);

test("two queued invokes whose held spans together pass one invoke's total bound each keep their runtime: the second is never charged to the first", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  expect(2 * HELD_SPAN_MS).toBeGreaterThan(INVOKE_TOTAL_BOUND_MS);
  expect(HELD_SPAN_MS).toBeLessThan(PLUGIN_BROKER_SYNC_TIMEOUT_MS - PLUGIN_INVOCATION_CPU_MS);
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "held-pair", capabilities: [] }, HELD_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  expect(await run("mark")).toEqual({ ok: true, value: null });

  // Each invoke's one span waits on a seam call the test holds; the second is held only once the first is let go.
  using first = edge.holdNext(HELD_SEAM_CALL);
  const calls = Promise.allSettled([run("held"), run("held")]);
  await first.reached;
  await sleep(HELD_SPAN_MS);
  using second = edge.holdNext(HELD_SEAM_CALL);
  first.release();
  await second.reached;
  await sleep(HELD_SPAN_MS);
  second.release();
  // Each ends however its own spent window ends it; what matters is that the broker never terminated the Worker.
  await calls;
  expect(await run("marked")).toEqual({ ok: true, value: true });
});

test("a span outside an invocation and the next invoke's own span, each under one span's bound, together pass that invoke's total bound and end its Worker alone", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  expect(2 * HELD_SPAN_MS).toBeGreaterThan(INVOKE_TOTAL_BOUND_MS);
  expect(HELD_SPAN_MS).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + PLUGIN_WORKER_OVERRUN_MAX_MS);
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "held-chain", capabilities: ["storage.kv"] }, HELD_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  // An ended guest's failure, the shape the terminated invocation's must share.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }
  expect(await run("mark")).toEqual({ ok: true, value: null });

  // The floated read settles after its command answered, and its span holds the Worker; the next invoke waits behind
  // it, the oldest command the broker holds, so that span counts toward it, and then its own span does.
  using outside = edge.holdNext(HELD_SEAM_CALL);
  expect(await run("floatHeld")).toEqual({ ok: true, value: null });
  await outside.reached;
  // The rejection lands while the test still holds the seam call, so it is caught now and asserted below.
  const next: Promise<unknown> = run("held").catch((error: unknown) => error);
  await sleep(HELD_SPAN_MS);
  using own = edge.holdNext(HELD_SEAM_CALL);
  outside.release();
  await own.reached;
  await sleep(HELD_SPAN_MS);
  own.release();
  expect(await next).toMatchObject({ name: ended.name, code: ended.code });
  // Only a Worker the broker terminated comes back without the mark.
  expect(await run("marked")).toEqual({ ok: true, value: false });
});

test("a resident command that stacks settlement spans ends as an ended invocation before the parent's backstop, and another owner's resident plugin answers after", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await rootWithBystander();
  const owner = await owners.root.principalFor(owners.root.ownerId);
  const pluginId = await installGuest(owners.root, owner, { slug: "stacked", capabilities: ["storage.kv"] }, STACKED_OPS);
  const run = guestRunner({ root: owners.root, caller: owner, pluginId, chatId: null });
  // An ended guest's failure, the shape the stacked command's must share.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }

  expect(await run("mark")).toEqual({ ok: true, value: null });

  const started = performance.now();
  await expect(run("stacked", { calls: HOST_CALLS_IN_FLIGHT_MAX })).rejects.toMatchObject({ name: ended.name, code: ended.code });
  expect(performance.now() - started).toBeLessThan(PLUGIN_COMMAND_TIMEOUT_MS.invoke);
  // The settlements waited once the invocation's account was spent, so its own wall ended it and its runtime stayed: the
  // mark set before is still there. Only a Worker the broker had to terminate comes back without it.
  expect(await run("marked")).toEqual({ ok: true, value: true });

  expect(await owners.ping()).toEqual({ ok: true, value: null });
  expect(await owners.bystanderStatus()).toBe(ENABLED);
});

const NET_HOST = "peer.test";
const HELD_URL = `https://${NET_HOST}/held`;
const SLOW_URL = `https://${NET_HOST}/slow`;
const INVOCATION_WALL_MS = settlementWallMs(PLUGIN_RESIDENT_LIMITS);
// A slow remote answer an honest invocation still waits out: well inside the host-call deadline.
const SLOW_ANSWER_MS = (7 * HOST_FN_DEADLINE_MS) / 10;
const QUEUED_OPS = {
  busyLoop: "() => { for (;;) {} }",
  // Waits out its wall: an ended invocation, and a strike.
  hang: "() => new Promise(() => {})",
  // Waits on a slow remote and answers: a clean run, which clears the consecutive strikes.
  slow: "async (h, room, a) => { await h.net.fetch(a.url); return null; }",
} as const;
// Every third queued invoke hangs, so the strikes never run to the disable threshold.
const QUEUED_PATTERN = Array.from({ length: EVENT_QUEUE_DEPTH }, (_, index) => ((index + 1) % PLUGIN_CRASH_DISABLE_THRESHOLD === 0 ? "hang" : "slow"));
// A red run waits for the broker's loss; a green one needs every queued invoke at its wall, with a wall of slack each.
const QUEUED_TEST_TIMEOUT_MS = 2 * EVENT_QUEUE_DEPTH * INVOCATION_WALL_MS + STALL_TEST_TIMEOUT_MS;

test("a full queue of one plugin's invokes, together longer than the parent's backstop, never ends the broker; each hung invoke fails alone and another owner's plugin answers throughout", {
  tags: ["slow"],
  timeout: QUEUED_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await rootWithBystander(async () => {
    await sleep(SLOW_ANSWER_MS);
    return new Response("slow");
  });
  const owner = await owners.root.principalFor(owners.root.ownerId);
  const pluginId = await installGuest(owners.root, owner, { slug: "queued", capabilities: ["net.fetch"], netHosts: [NET_HOST] }, QUEUED_OPS);
  const run = guestRunner({ root: owners.root, caller: owner, pluginId, chatId: null });
  // An ended guest's failure, the shape each hung invoke's must share; the slow run after it clears its strike.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }
  expect(await run("slow", { url: SLOW_URL })).toEqual({ ok: true, value: null });

  const started = performance.now();
  const settled = Promise.allSettled(QUEUED_PATTERN.map((op) => run(op, { url: SLOW_URL })));
  const drained = settled.then(() => true);
  // Another owner's plugin is pinged once per invocation wall for as long as the queue drains.
  const pings: Awaited<ReturnType<GuestRun>>[] = [];
  while (!(await Promise.race([drained, sleep(INVOCATION_WALL_MS, false)]))) {
    pings.push(await owners.ping());
  }
  const outcomes = await settled;
  // The queue outlasted one command backstop, which a timer started at send would have spent on the last invoke.
  expect(performance.now() - started).toBeGreaterThan(PLUGIN_COMMAND_TIMEOUT_MS.invoke);

  const expected = {
    hang: { status: "rejected", reason: expect.objectContaining({ name: ended.name, code: ended.code }) },
    slow: { status: "fulfilled", value: { ok: true, value: null } },
  };
  expect(outcomes).toEqual(QUEUED_PATTERN.map((op) => expected[op]));
  expect(pings.length).toBeGreaterThan(1);
  expect(pings).toEqual(pings.map(() => ({ ok: true, value: null })));
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  expect(await owners.bystanderStatus()).toBe(ENABLED);
  expect((await owners.root.services.plugin.list({ caller: owner })).find(({ id }) => id === pluginId)?.status).toBe(ENABLED);
});

// A remote that never answers the held request and reports when the host aborts it.
function heldRemote(): { readonly fetch: typeof fetch; readonly aborted: Promise<void> } {
  const aborted = Promise.withResolvers<void>();
  return {
    aborted: aborted.promise,
    fetch: (input, init): Promise<Response> =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal ?? new Request(input).signal;
        signal.addEventListener(
          "abort",
          () => {
            aborted.resolve();
            reject(new Error("the held request was aborted", { cause: signal.reason }));
          },
          { once: true },
        );
      }),
  };
}

const STUCK_OPS = {
  busyLoop: "() => { for (;;) {} }",
  mark: "() => { globalThis.mark = true; return null; }",
  marked: "() => globalThis.mark === true",
  // A write and a fetch already handed to the host, then one native call that outlives the Worker.
  stall: `(h, room, a) => { h.storage.set('k', 'written'); h.net.fetch(a.url); ${NATIVE_STALL} return null; }`,
  read: "(h) => h.storage.get('k')",
} as const;

test("a resident guest stuck in one native call fails that invocation with the ended refusal; its write lands, its fetch is aborted, and a fresh runtime serves the next call", {
  tags: ["slow"],
  timeout: STALL_TEST_TIMEOUT_MS,
}, async () => {
  const remote = heldRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "stuck", capabilities: ["storage.kv", "net.fetch"], netHosts: [NET_HOST] }, STUCK_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  // An ended guest's failure, the shape the terminated invocation's must share.
  const ended: unknown = await run("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }
  expect(await run("mark")).toEqual({ ok: true, value: null });

  const started = performance.now();
  await expect(run("stall", { url: HELD_URL })).rejects.toMatchObject({ name: ended.name, code: ended.code });
  expect(performance.now() - started).toBeLessThan(PLUGIN_INVOCATION_CPU_MS + END_MARGIN_MS);
  await remote.aborted;

  // The runtime is new: the mark set in the old one is gone, and the write the old one handed over is there.
  expect(await run("marked")).toEqual({ ok: true, value: false });
  expect(await run("read")).toEqual({ ok: true, value: "written" });
  expect((await root.services.plugin.list({ caller: owner })).find(({ id }) => id === pluginId)).toMatchObject({ status: ENABLED });
});

test("after a lost broker a resident plugin is served by a new one with no owner action, and never struck", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installNativeGuest(root, "lost-broker", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");

  const child = firstChild(edge);
  const exited = once(child, "exit");
  expect(child.kill("SIGKILL")).toBe(true);
  await exited;
  // More calls than the strike threshold: a recovery that failed them would disable the plugin.
  for (let call = 0; call < PLUGIN_CRASH_DISABLE_THRESHOLD; call += 1) {
    await guest.invoke("noop");
  }
  expect(edge.children).toHaveLength(2);
  expect((await guest.view()).status).toBe(ENABLED);
});
