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
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { PLUGIN_INVOCATION_CPU_MS, PLUGIN_WORKER_OVERRUN_MAX_MS, PLUGIN_WORKER_SPAN_CHECK_MS, SNIPPET_WALL_MS } from "#server/infra/plugin-host/budgets.ts";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  firstChild,
  installGuest as installNativeGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
} from "./process-runtime.fixtures.ts";

const NATIVE_TIME = { now: (): number => Date.now(), monotonicNow: (): number => performance.now(), timers: systemTimers };
// One string search whose cost is (haystack − needle) × needle: minutes, far past the parent's snippet command timeout,
// with no interrupt poll inside it.
const NATIVE_STALL = "'a'.repeat(400000).indexOf('a'.repeat(100000) + 'b');";
// A loop whose one interrupt poll period, a wide slice per step, runs far past the parent's snippet command timeout.
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

test.for([
  { name: "one native call", code: NATIVE_STALL },
  { name: "one long interrupt poll period", code: POLL_GAP_STALL },
] as const)(
  "a snippet stuck in $name ends alone at its deadline, and another owner's resident plugin answers during and after, still enabled",
  { tags: ["slow"], timeout: STALL_TEST_TIMEOUT_MS },
  async ({ code }) => {
    // The broker and the parent run on production timers: the parent's command timeout is what would kill the broker.
    await using seed = await createServerHarness({ startJobs: false });
    const bystanderId = await seed.app.sessions.ensureUser(BYSTANDER_HANDLE);
    await using root = await createServerHarness({
      db: seed.db,
      ownerId: seed.ownerId,
      idSource: createIdSource(),
      startJobs: false,
      pluginSpawn: spawn,
      time: NATIVE_TIME,
    });
    const bystander = await root.principalFor(bystanderId);
    const pluginId = await installGuest(root, bystander, { slug: "bystander", capabilities: ["storage.kv"] }, { ping: "(h) => h.storage.get('k')" });
    const ping = guestRunner({ root, caller: bystander, pluginId, chatId: null });
    expect(await ping("ping")).toEqual({ ok: true, value: null });

    const member = await root.internalCallerFor(root.ownerId);
    const room = (await member.chat.startChat({ characterIds: [] })).chat;
    // A busy loop's snippet ends at its window: its time carries the same Worker start and load as the stalled run.
    const busyStarted = performance.now();
    expect((await member.plugin.runSnippet({ chatId: room.id, code: "for (;;) {}" })).error).toBeDefined();
    const busyMs = performance.now() - busyStarted;

    const started = performance.now();
    const stuck = member.plugin.runSnippet({ chatId: room.id, code });
    await sleep(SNIPPET_WALL_MS);
    expect(await ping("ping")).toEqual({ ok: true, value: null });
    const ended = await stuck;
    expect(ended.error).toBeDefined();
    expect(ended).toMatchObject({ logLines: [], errorKind: "runtime" });
    expect(performance.now() - started).toBeLessThan(busyMs + END_MARGIN_MS);

    expect(await ping("ping")).toEqual({ ok: true, value: null });
    expect(await member.plugin.runSnippet({ chatId: room.id, code: NEXT_SNIPPET })).toEqual({ logLines: NEXT_SNIPPET_LINES });
    expect((await root.services.plugin.list({ caller: bystander })).find(({ id }) => id === pluginId)).toMatchObject({ status: ENABLED });
  },
);

const NET_HOST = "peer.test";
const HELD_URL = `https://${NET_HOST}/held`;

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

test("a lost broker fails a resident plugin's calls as host-unavailable, never as strikes", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installNativeGuest(root, "lost-broker", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");

  const child = firstChild(edge);
  const exited = once(child, "exit");
  expect(child.kill("SIGKILL")).toBe(true);
  await exited;
  for (let call = 0; call < PLUGIN_CRASH_DISABLE_THRESHOLD; call += 1) {
    await expect(guest.invoke("noop")).toThrowTRPCError("CONFLICT");
  }
  expect((await guest.view()).status).toBe(ENABLED);
});
