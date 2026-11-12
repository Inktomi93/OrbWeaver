// @subject packages/server/src/infra/plugin-host/process-channel.ts
// A full IPC queue refuses the frame that would overflow it, to the plugin that sized it, and never ends the broker (D348),
// the watchdog or the parent's channel; each plugin runtime has its own share of every queue, so one owner's flood
// leaves another owner's plugin served and unstruck. The strike count is read from the plugin's row, which no door shows.
import { readFileSync } from "node:fs";
import type { PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_KV_VALUE_MAX_BYTES } from "@orb/contracts/plugin";
import { brandedId, createIdSource } from "@orb/kit/ids";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { GuestRun, NativeServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import { HOST_CALLS_IN_FLIGHT_MAX, HOST_FN_ARGS_MAX_BYTES, PLUGIN_NET_MAX_BYTES } from "#server/infra/plugin-host/budgets.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { PLUGIN_HOST_UNAVAILABLE } from "#server/infra/plugin-host/process-protocol.ts";
import { createPluginProcessEdge, firstChild } from "../process-runtime.fixtures.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const BROKER_STOPPED = "stopped" satisfies NonNullable<ReturnType<typeof parsePluginIpcMessage>>["kind"];
const BYSTANDER_HANDLE = brandedId("Handle").parse("bystander");
const NET_HOST = "peer.test";
const BULK_URL = `https://${NET_HOST}/bulk`;
// Every flood runs real guests through a real broker and watchdog, each call carrying or returning about a megabyte.
const FLOOD_TEST_TIMEOUT_MS = 120_000;
// Each flooding invoke issues its whole in-flight allowance at once and reports what every call settled as.
const FLOOD_OPS = {
  // Megabyte arguments that cross the channels before the host refuses them for their size: the bytes are the flood.
  floodStore:
    "async (h, room, a) => { const big = 'x'.repeat(a.bytes); const settled = await Promise.allSettled(Array.from({ length: a.calls }, (_, i) => h.storage.set('k' + i, big))); return settled.map((s) => (s.status === 'fulfilled' ? 'ok' : String(s.reason && s.reason.name))); }",
  // Megabyte results, the flood in the other direction: tiny to ask for, so the guest spends little, and refused or
  // served when they cross back.
  floodFetch:
    "async (h, room, a) => { const settled = await Promise.allSettled(Array.from({ length: a.calls }, () => h.net.fetch(a.url))); return settled.map((s) => (s.status === 'fulfilled' ? 'ok' : String(s.reason && s.reason.name))); }",
  // A burst a showcase plugin makes: every key of a full value read back at once.
  readBack:
    "async (h, room, a) => { const value = 'x'.repeat(a.bytes); for (let i = 0; i < a.calls; i++) { await h.storage.set('r' + i, value); } const read = await Promise.all(Array.from({ length: a.calls }, (_, i) => h.storage.get('r' + i))); return read.filter((v) => v === value).length; }",
  oneSet: "async (h, room, a) => h.storage.set('one', 'x'.repeat(a.bytes))",
} as const;
const ARG_BYTES = HOST_FN_ARGS_MAX_BYTES - HOST_CALLS_IN_FLIGHT_MAX;
// The outcome of one flooding invoke: the name its every call settled as, or the whole invoke ended by the guest's own
// CPU window while it copied its arguments out — both contained, neither a lost broker.
type FloodOutcome = { readonly kind: "settled"; readonly names: readonly string[] } | { readonly kind: "interrupted"; readonly name: string };
const BULK_BODY = "x".repeat(PLUGIN_NET_MAX_BYTES - HOST_CALLS_IN_FLIGHT_MAX);

interface Owners extends AsyncDisposable {
  readonly root: NativeServerTestHarness;
  readonly edge: ReturnType<typeof createPluginProcessEdge>;
  readonly ping: () => ReturnType<GuestRun>;
  readonly bystanderCrashes: () => Promise<number>;
}

// A root on the production broker, with a remote that answers every request with a near-cap body, and a second owner
// whose resident plugin answers a ping.
async function ownersOnOneBroker(): Promise<Owners> {
  await using stack = new AsyncDisposableStack();
  const seed = stack.use(await createServerHarness({ startJobs: false }));
  const bystanderId = await seed.app.sessions.ensureUser(BYSTANDER_HANDLE);
  const edge = createPluginProcessEdge();
  const root = stack.use(
    await createServerHarness({
      db: seed.db,
      ownerId: seed.ownerId,
      idSource: createIdSource(),
      startJobs: false,
      pluginSpawn: edge.spawn,
      networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: () => Promise.resolve(new Response(BULK_BODY)) },
    }),
  );
  const bystander = await root.principalFor(bystanderId);
  const pluginId = await installGuest(root, bystander, { slug: "bystander", capabilities: ["storage.kv"] }, { ping: "(h) => h.storage.get('k')" });
  const ping = guestRunner({ root, caller: bystander, pluginId, chatId: null });
  const owned = stack.move();
  return {
    root,
    edge,
    ping: () => ping("ping"),
    bystanderCrashes: async () => (await capturePluginRows(root.db, bystanderId, pluginId)).plugin.consecutiveCrashes,
    [Symbol.asyncDispose]: () => owned.disposeAsync(),
  };
}

// The broker is the watchdog's one child process, and no production surface names its pid, so this reads it from the
// watchdog's Linux process entry.
function brokerPid(edge: Owners["edge"]): number {
  const watchdog = firstChild(edge).pid;
  const children = readFileSync(`/proc/${String(watchdog)}/task/${String(watchdog)}/children`, "utf8")
    .trim()
    .split(" ");
  expect(children).toHaveLength(1);
  return Number(children[0]);
}

async function floodingPlugins(owners: Owners, count: number): Promise<readonly GuestRun[]> {
  const owner = await owners.root.principalFor(owners.root.ownerId);
  const runs: GuestRun[] = [];
  for (let index = 0; index < count; index += 1) {
    const pluginId = await installGuest(
      owners.root,
      owner,
      { slug: `flood-${String(index)}`, capabilities: ["storage.kv", "net.fetch"], netHosts: [NET_HOST] },
      FLOOD_OPS,
    );
    runs.push(guestRunner({ root: owners.root, caller: owner, pluginId, chatId: null }));
  }
  return runs;
}

// One plugin's flood of megabyte arguments. A guest invoke that overruns its CPU window copying the arguments out
// surfaces as a throw, not a value, so the harness throw is caught and read as the contained interrupt it is.
async function floodArgs(run: GuestRun, calls: number): Promise<FloodOutcome> {
  try {
    const outcome = await run("floodStore", { calls, bytes: ARG_BYTES });
    if (!(outcome.ok && Array.isArray(outcome.value))) {
      throw new Error(`a flood invoke did not report its calls: ${JSON.stringify(outcome)}`);
    }
    return { kind: "settled", names: outcome.value.map(String) };
  } catch (error) {
    return { kind: "interrupted", name: error instanceof Error ? error.name : String(error) };
  }
}

// Every flooding call that settled is served, refused for its size by the host, or refused by a full channel; a flood
// the guest's CPU window ended is contained too. Nothing else, a lost broker included, appears.
function expectContained(outcomes: readonly FloodOutcome[], served: readonly string[]): void {
  for (const outcome of outcomes) {
    if (outcome.kind === "interrupted") {
      continue;
    }
    expect(outcome.names.filter((name) => name !== PLUGIN_HOST_UNAVAILABLE && !served.includes(name))).toEqual([]);
  }
}

async function expectBrokerKept(owners: Owners, broker: number): Promise<void> {
  expect(owners.edge.delivered.filter((value) => parsePluginIpcMessage(value)?.kind === BROKER_STOPPED)).toEqual([]);
  expect(owners.edge.children).toHaveLength(1);
  expect(firstChild(owners.edge)).toMatchObject({ exitCode: null, signalCode: null });
  expect(brokerPid(owners.edge)).toBe(broker);
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  expect(await owners.bystanderCrashes()).toBe(0);
}

test.for([
  { plugins: 2, name: "two" },
  { plugins: 6, name: "six" },
] as const)(
  "$name plugins of one owner flooding host calls with megabyte arguments are contained alone, and another owner's plugin answers during and after",
  { tags: ["slow"], timeout: FLOOD_TEST_TIMEOUT_MS },
  async ({ plugins }) => {
    await using owners = await ownersOnOneBroker();
    expect(await owners.ping()).toEqual({ ok: true, value: null });
    const broker = brokerPid(owners.edge);
    const runs = await floodingPlugins(owners, plugins);
    // What a megabyte value settles as when the channels have room: the host's own size refusal.
    const sizeRefusal = await runs[0]?.("oneSet", { bytes: ARG_BYTES });
    if (sizeRefusal?.ok !== false) {
      throw new Error("a megabyte storage value is refused by the host");
    }

    const [pinged, ...outcomes] = await Promise.all([owners.ping(), ...runs.map((run) => floodArgs(run, HOST_CALLS_IN_FLIGHT_MAX))]);
    expect(pinged).toEqual({ ok: true, value: null });
    expectContained(outcomes, [sizeRefusal.name]);
    await expectBrokerKept(owners, broker);
  },
);

test("three plugins of one owner flooding host calls with megabyte results are refused alone, and another owner's plugin answers during and after", {
  tags: ["slow"],
  timeout: FLOOD_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await ownersOnOneBroker();
  expect(await owners.ping()).toEqual({ ok: true, value: null });
  const broker = brokerPid(owners.edge);
  const runs = await floodingPlugins(owners, 3);

  // The result frames fill the parent's channel, not the guest's CPU, so every flooding plugin reports its calls, and a
  // full channel's coded refusal is among them.
  const [pinged, ...outcomes] = await Promise.all([owners.ping(), ...runs.map((run) => run("floodFetch", { calls: HOST_CALLS_IN_FLIGHT_MAX, url: BULK_URL }))]);
  expect(pinged).toEqual({ ok: true, value: null });
  for (const outcome of outcomes) {
    if (!(outcome.ok && Array.isArray(outcome.value))) {
      throw new Error(`a flood invoke did not report its calls: ${JSON.stringify(outcome)}`);
    }
    expect(outcome.value).toContain(PLUGIN_HOST_UNAVAILABLE);
    expect(outcome.value.filter((name) => name !== PLUGIN_HOST_UNAVAILABLE && name !== "ok")).toEqual([]);
  }
  await expectBrokerKept(owners, broker);
});

test("a showcase-sized burst, every full stored value read back at once, is served whole", { tags: ["slow"], timeout: FLOOD_TEST_TIMEOUT_MS }, async () => {
  await using owners = await ownersOnOneBroker();
  const [run] = await floodingPlugins(owners, 1);
  if (run === undefined) {
    throw new Error("the burst plugin installed");
  }
  // The largest value the store keeps, less room for its key and quotes, so every write lands.
  const bytes = PLUGIN_KV_VALUE_MAX_BYTES - HOST_CALLS_IN_FLIGHT_MAX;
  expect(await run("readBack", { calls: HOST_CALLS_IN_FLIGHT_MAX, bytes })).toEqual({ ok: true, value: HOST_CALLS_IN_FLIGHT_MAX });
  expect(owners.edge.delivered.filter((value) => parsePluginIpcMessage(value)?.kind === BROKER_STOPPED)).toEqual([]);
});

// A quarter of the allowance of megabyte values: enough to refuse by the host's size cap, few enough that the guest
// stays inside its CPU window and handles every refusal, so it keeps its row unstruck.
const HANDLED_CALLS = HOST_CALLS_IN_FLIGHT_MAX / 4;

test("a plugin that floods within its CPU window and handles every refusal keeps its own row unstruck", {
  tags: ["slow"],
  timeout: FLOOD_TEST_TIMEOUT_MS,
}, async () => {
  await using owners = await ownersOnOneBroker();
  const owner = await owners.root.principalFor(owners.root.ownerId);
  const pluginId = await installGuest(owners.root, owner, { slug: "handled", capabilities: ["storage.kv"] }, FLOOD_OPS);
  const run = guestRunner({ root: owners.root, caller: owner, pluginId, chatId: null });
  const sizeRefusal = await run("oneSet", { bytes: ARG_BYTES });
  if (sizeRefusal.ok) {
    throw new Error("a megabyte storage value is refused by the host");
  }
  const outcome = await floodArgs(run, HANDLED_CALLS);
  if (outcome.kind !== "settled") {
    throw new Error("the handled flood stays inside its CPU window");
  }
  expect(outcome.names).toHaveLength(HANDLED_CALLS);
  expectContained([outcome], [sizeRefusal.name]);
  expect((await capturePluginRows(owners.root.db, owners.root.ownerId, pluginId)).plugin.consecutiveCrashes).toBe(0);
  expect((await owners.root.services.plugin.list({ caller: owner })).find(({ id }) => id === pluginId)?.status).toBe(ENABLED);
});
