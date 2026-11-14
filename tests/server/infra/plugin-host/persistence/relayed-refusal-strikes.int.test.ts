// A host refusal raised past the app, where a full channel the watchdog or broker relays refuses a call or its result, is
// never the plugin's crash when its guest leaves it uncaught: the Worker records it for its command, and the command, or
// the rebuild it fails, fails as that refusal, for an async call and a synchronous one alike. A rebuild whose answer a
// full channel refused fails as that refusal too, though the broker has already ended its runtime. A command the host
// ended at its settlement wall strikes whatever refusal it met (D347). Each refusal case's control is a guest's own throw
// in another command, which still counts. The crash count is read from the plugin's row, which no door shows.
//
// The edge's `refuseNextSent` stands in for the watchdog's full hop to the broker: it sends one routed app frame's own
// route refusal in its place, the frame `relayFrame` in `packages/server/src/infra/plugin-host/process-channel.ts`
// passes on when its target refuses the frame, which for a result is the channel-full result `sendBridgeResult` routes.
// @subject packages/server/src/infra/plugin-host/worker-runtime.ts
// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/infra/plugin-host/port.ts

import { isDeepStrictEqual } from "node:util";
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability, PluginManifest, PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_CHANNEL_FULL_CODE, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import { afterAll, beforeAll } from "vitest";
import { PLUGIN_RESIDENT_LIMITS, settlementWallMs } from "#server/infra/plugin-host/budgets.ts";
import { PLUGIN_CHANNEL_FULL, PLUGIN_HOST_UNAVAILABLE } from "#server/infra/plugin-host/process-protocol.ts";
import { createPluginProcessEdge, frameField, hasOperation, PLUGIN_PROCESS_OPERATIONS, responseResult } from "../process-runtime.fixtures.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const RESPONSE = "response";
const NOTE = "note";
const READ = "read";
const DRAW = "draw";
const READ_THEN = "read_then";
const SET_MODE = "set_mode";
const CRASH = "crash";
const CRASH_MESSAGE = "the guest's own failure";
const CALLER_KEY = "k";
const MODE_KEY = "mode";
const FIRST_KEY = "first";
// What the sleeper's main.js does after its read is refused: rethrow it, or never settle.
const STALL = "stall";
const THROW_MODE = JSON.stringify({ mode: "throw" });
const STALL_MODE = JSON.stringify({ mode: STALL });
const CAPABILITIES = ["ui.surface", "storage.kv"] as const satisfies readonly PluginCapability[];
const COMMON_COMMANDS = `h.ui.registerCommand({ name: ${JSON.stringify(NOTE)}, describe: "Note a line", onRun: () => { h.log.info("noted"); } });
h.ui.registerCommand({ name: ${JSON.stringify(CRASH)}, describe: "Crash", onRun: () => { throw new Error(${JSON.stringify(CRASH_MESSAGE)}); } });`;
// Each command makes one host call and leaves its failure uncaught: an async storage read, or a synchronous draw.
const CALLER_SOURCE = `const h = orb.host(1);
${COMMON_COMMANDS}
h.ui.registerCommand({ name: ${JSON.stringify(READ)}, describe: "Read", onRun: async () => { await h.storage.get(${JSON.stringify(CALLER_KEY)}); } });
h.ui.registerCommand({ name: ${JSON.stringify(DRAW)}, describe: "Draw", onRun: () => { h.random.next(); } });
h.ui.registerCommand({ name: ${JSON.stringify(READ_THEN)}, describe: "Read, then throw or never settle", onRun: async ({ args }) => {
  await h.storage.get(${JSON.stringify(CALLER_KEY)}).catch(() => undefined);
  if (JSON.parse(args).stall === true) { await new Promise(() => {}); }
  throw new Error(${JSON.stringify(CRASH_MESSAGE)});
} });`;
// main.js reads its mode, then its own storage; a refused read it rethrows uncaught, or in the stall mode never settles,
// so a rebuild whose read is refused fails at once or at its wall. A command sets the mode for the next rebuild.
const SLEEPER_SOURCE = `const h = orb.host(1);
${COMMON_COMMANDS}
h.ui.registerCommand({ name: ${JSON.stringify(SET_MODE)}, describe: "Set the rebuild mode", onRun: async ({ args }) => {
  await h.storage.set(${JSON.stringify(MODE_KEY)}, JSON.parse(args).mode);
} });
(async () => {
  const mode = await h.storage.get(${JSON.stringify(MODE_KEY)});
  try {
    await h.storage.get(${JSON.stringify(FIRST_KEY)});
  } catch (refused) {
    if (mode === ${JSON.stringify(STALL)}) { await new Promise(() => {}); }
    throw refused;
  }
})();`;
const NEIGHBOUR_SOURCE = `orb.host(1).ui.registerCommand({ name: ${JSON.stringify(NOTE)}, describe: "Note a line", onRun: () => {} });`;
// The hook boots a root and starts a real broker for three activations, which outruns the default hook budget.
const BROKER_START_HOOK_TIMEOUT_MS = 30_000;
// A wall case waits out one real settlement wall, a production bound no test clock reaches; the rest is a few commands.
const WALL_CASE_TIMEOUT_MS = 3 * settlementWallMs(PLUGIN_RESIDENT_LIMITS);

interface GuestView {
  readonly status: PluginStatus | undefined;
  readonly crashes: number;
}

interface Guest {
  readonly id: PluginId;
  readonly run: (name: string, args?: string) => Promise<unknown>;
  readonly view: () => Promise<GuestView>;
}

let root: ServerTestHarness;
let edge: ReturnType<typeof createPluginProcessEdge>;
let lifetime: AsyncDisposableStack;
let caller: Guest;
let sleeper: Guest;
let neighbour: Guest;

function manifest(id: string): PluginManifest {
  return pluginManifestSchema.parse({
    id,
    name: `Relayed ${id}`,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Leaves a refused host call uncaught.",
    capabilities: CAPABILITIES,
  });
}

async function install(member: Principal, id: string, source: string): Promise<Guest> {
  const plugin = manifest(id);
  const installed = await seedInstalledPlugin(root, { caller: member, bundle: makePluginBundle(plugin, source, root.clock.now()), grant: [] });
  const pluginId = installed.outcome.id;
  await seedPluginGrant(root, { caller: member, pluginId, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const rpc = await root.internalCallerFor(member.userId);
  return {
    id: pluginId,
    run: (name, args = "{}") => rpc.plugin.invokeUiCommand({ pluginId, name, args, chatId: null }),
    view: async (): Promise<GuestView> => {
      const listed = (await root.services.plugin.list({ caller: member })).find(({ id: listedId }) => listedId === pluginId);
      const { plugin: row } = await capturePluginRows(root.db, member.userId, pluginId);
      return { status: listed?.status, crashes: row.consecutiveCrashes };
    },
  };
}

// The root, its broker and every install are the cases' setup; one Worker, so running one plugin puts the others to sleep.
beforeAll(async () => {
  await using construction = new AsyncDisposableStack();
  edge = createPluginProcessEdge();
  root = construction.use(await createServerHarness({ pluginSpawn: edge.spawn, env: { ["PLUGIN_BROKER_WORKER_MAX"]: "1" } }));
  const member = await root.principalFor((await root.actor()).id);
  caller = await install(member, "relayed-caller", CALLER_SOURCE);
  sleeper = await install(member, "relayed-sleeper", SLEEPER_SOURCE);
  neighbour = await install(member, "relayed-neighbour", NEIGHBOUR_SOURCE);
  lifetime = construction.move();
}, BROKER_START_HOOK_TIMEOUT_MS);

afterAll(async () => {
  await lifetime.disposeAsync();
});

const settle = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => null,
    (error: unknown) => error,
  );

// A storage read of one key, as the broker forwards it to the app.
const readOf =
  (key: string) =>
  (value: unknown): boolean =>
    hasOperation(value, PLUGIN_PROCESS_OPERATIONS.read) && isDeepStrictEqual(frameField(value, "args"), [key]);
const drawn = (value: unknown): boolean => hasOperation(value, PLUGIN_PROCESS_OPERATIONS.draw);

// Starts `run` and refuses the result of the one call it makes that `matches`, as the watchdog does when its channel to
// the broker is full: the app sent the result, so only the hops past it know the call was refused.
async function refuseResultOf(matches: (value: unknown) => boolean, run: () => Promise<unknown>): Promise<{ readonly settled: Promise<unknown> }> {
  using call = edge.holdNext(matches);
  const settled = settle(run());
  const id = frameField(await call.reached, "id");
  const refused = edge.refuseNextSent((value) => frameField(value, "kind") === "bridge-result" && frameField(value, "id") === id);
  call.release();
  await refused;
  return { settled };
}

async function expectOwnThrowCounts(guest: Guest): Promise<void> {
  await expect(guest.run(CRASH)).rejects.toThrow(CRASH_MESSAGE);
  await expect.poll(async () => (await guest.view()).crashes).toBe(1);
  expect((await guest.view()).status).toBe(ENABLED);
}

test.for([
  { name: "an async read", command: READ, call: readOf(CALLER_KEY) },
  { name: "a synchronous draw", command: DRAW, call: drawn },
] as const)(
  "$name whose result a relaying channel refused is not the plugin's crash when left uncaught, and its own throw still counts",
  async ({ command, call }) => {
    await caller.run(NOTE);
    expect(await caller.view()).toEqual({ status: ENABLED, crashes: 0 });

    const { settled: failed } = await refuseResultOf(call, () => caller.run(command));
    expect(await failed).toBeInstanceOf(Error);
    expect(await caller.view()).toEqual({ status: ENABLED, crashes: 0 });

    await expectOwnThrowCounts(caller);
  },
);

// The sleeper has never run a command since its install, so it is asleep, unstruck and in the throw mode; each Worker
// start costs this case its budget, so it starts only the two rebuilds.
test("a rebuild whose main.js read a relaying channel refused fails as that refusal, and the plugin's own throw still counts", async () => {
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 0 });

  const { settled: failed } = await refuseResultOf(readOf(FIRST_KEY), () => sleeper.run(NOTE));
  expect(await failed).toBeInstanceOf(Error);
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 0 });

  await expectOwnThrowCounts(sleeper);
});

// The sleeper is resident from the last case, so its clean run and its control cost no Worker start; only the
// neighbour's run and the refused rebuild do.
test("a failed rebuild whose answer a full channel refused fails as that refusal, and the plugin's own throw still counts", async () => {
  await sleeper.run(SET_MODE, THROW_MODE);
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 0 });
  await expectOwnThrowCounts(sleeper);
  await neighbour.run(NOTE);

  const { settled: failed } = await refuseResultOf(readOf(FIRST_KEY), () => sleeper.run(NOTE));
  // The rebuild's main.js failed, so the broker ends its runtime before it answers; the answer is refused on the way.
  using answer = edge.holdNext((value) => frameField(value, "kind") === RESPONSE);
  answer.release(
    responseResult(await answer.reached, { ok: false, error: { name: PLUGIN_HOST_UNAVAILABLE, message: PLUGIN_CHANNEL_FULL, code: PLUGIN_CHANNEL_FULL_CODE } }),
  );
  expect(await failed).toBeInstanceOf(Error);
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 1 });
});

// The case's only real wait is the production settlement wall, which no test clock reaches.
test("a command that met a refused call and then never settled strikes at its wall, though the same command ending in a throw does not", {
  tags: ["slow"],
  timeout: WALL_CASE_TIMEOUT_MS,
}, async () => {
  await caller.run(NOTE);
  expect(await caller.view()).toEqual({ status: ENABLED, crashes: 0 });

  // Control: the refused read excuses the command's own throw after it.
  const { settled: thrown } = await refuseResultOf(readOf(CALLER_KEY), () => caller.run(READ_THEN, JSON.stringify({ stall: false })));
  await expect(thrown).resolves.toBeInstanceOf(Error);
  expect(await caller.view()).toEqual({ status: ENABLED, crashes: 0 });

  // The same refusal, then no settlement: the host ends the invocation at its wall, and that is the plugin's strike.
  const { settled: ended } = await refuseResultOf(readOf(CALLER_KEY), () => caller.run(READ_THEN, JSON.stringify({ stall: true })));
  await expect(ended).resolves.toBeInstanceOf(Error);
  await expect.poll(async () => (await caller.view()).crashes).toBe(1);
  expect((await caller.view()).status).toBe(ENABLED);
});

// The case's only real wait is the production settlement wall, which no test clock reaches.
test("a rebuild that met a refused read and then never settled strikes at its wall, though the same rebuild ending in a throw does not", {
  tags: ["slow"],
  timeout: WALL_CASE_TIMEOUT_MS,
}, async () => {
  // Control: the rebuild rethrows its refused read, which is never the plugin's crash.
  await sleeper.run(SET_MODE, THROW_MODE);
  await neighbour.run(NOTE);
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 0 });
  const { settled: thrown } = await refuseResultOf(readOf(FIRST_KEY), () => sleeper.run(NOTE));
  await expect(thrown).resolves.toBeInstanceOf(Error);
  expect(await sleeper.view()).toEqual({ status: ENABLED, crashes: 0 });

  // The same refused read, then main.js never settles: the host ends the rebuild at its wall, and that is the strike.
  await sleeper.run(SET_MODE, STALL_MODE);
  await neighbour.run(NOTE);
  const { settled: ended } = await refuseResultOf(readOf(FIRST_KEY), () => sleeper.run(NOTE));
  await expect(ended).resolves.toBeInstanceOf(Error);
  await expect.poll(async () => (await sleeper.view()).crashes).toBe(1);
  expect((await sleeper.view()).status).toBe(ENABLED);
});
