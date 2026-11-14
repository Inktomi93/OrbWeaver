// A handler run its installer's own plugin command caused runs one cascade level deeper than that command, on the
// pubsub plane and the trigger plane alike, and past `PLUGIN_CASCADE_DEPTH_MAX` an emit is refused with
// `PluginPubsubDepthError` and a self-raised fact is not delivered. So a plugin that wakes itself, or two that wake each
// other, stop at that depth through the composed root and a real broker, while the shipped one-hop composition, the
// oracle deck announcing a draw to scene chips, still delivers. A floated emit answers for its own command's depth, not
// for whichever invocation ran on the instance since.
// @subject packages/server/src/domain/plugin/substrate/bridge.ts
// @subject packages/server/src/domain/plugin/substrate/plugin-event-bus.ts
// @subject packages/server/src/domain/plugin/verbs/registrar-ops.ts
// @subject packages/server/src/infra/plugin-host/bridge-rpc.ts
// @subject packages/server/src/infra/plugin-host/worker-runtime.ts

import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import { PLUGIN_CASCADE_DEPTH_MAX, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PluginPubsubDepthError, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import type { PluginId } from "@orb/kit/ids";
import { parseBundle } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, requireShowcaseBundle } from "@orb/testkit/node/composed";
import { failOnExportNote } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { createPluginProcessEdge, frameField, hasOperation, PLUGIN_PROCESS_OPERATIONS } from "../../../infra/plugin-host/process-runtime.fixtures.ts";

const DELIVERIES_KEY = "deliveries";
const STOPPED_KEY = "stopped";
const START = "start";
const NOTE = "note";
const CAPABILITIES = ["ui.surface", "plugin_events", "storage.kv"] as const satisfies readonly PluginCapability[];
const ORACLE = "oracle-deck";
const CHIPS = "scene-chips";
// The scene chips' note of the last card the oracle announced, the key its listener writes.
const OMEN_KEY = "omen";
// Every case runs its plugins on one Worker, so each hop between two plugins starts one; a hop's slack is a Worker start.
const DEPTH_CASE_TIMEOUT_MS = 90_000;
const POLL_TIMEOUT_MS = 30_000;
const DEPTH_REFUSAL = new PluginPubsubDepthError().name;

const stoppedSchema = z.strictObject({ deliveries: z.int(), name: z.string() });
const omenSchema = z.object({ card: z.string().min(1) });
const DRAW = "draw";

/** A relay listens on one channel, counts each delivery and answers it with its own emit, recording the refusal that
 *  stops it; its `start` command emits once from a human-started invocation. */
interface Relay {
  readonly slug: string;
  readonly listens: { readonly emitterSlug: string; readonly name: string };
  readonly emits: string;
}

function relaySource({ listens, emits }: Relay): string {
  return `const h = orb.host(1);
h.pubsub.on(${JSON.stringify(listens.emitterSlug)}, ${JSON.stringify(listens.name)}, async () => {
  const deliveries = Number((await h.storage.get(${JSON.stringify(DELIVERIES_KEY)})) ?? "0") + 1;
  await h.storage.set(${JSON.stringify(DELIVERIES_KEY)}, String(deliveries));
  try { await h.pubsub.emit(${JSON.stringify(emits)}, {}); }
  catch (refused) { await h.storage.set(${JSON.stringify(STOPPED_KEY)}, JSON.stringify({ deliveries, name: refused.name })); }
});
h.ui.registerCommand({ name: ${JSON.stringify(START)}, describe: "Announce once", onRun: async () => { await h.pubsub.emit(${JSON.stringify(emits)}, {}); } });
h.ui.registerCommand({ name: ${JSON.stringify(NOTE)}, describe: "Answer at once", onRun: () => {} });`;
}

interface Installed {
  readonly run: (name: string, args?: string) => Promise<unknown>;
  readonly read: (key: string) => Promise<string | null>;
}

// Installs `bundle` and grants every capability its manifest requests.
async function install(root: ServerTestHarness, owner: Principal, bundle: Uint8Array): Promise<Installed> {
  const installed = await root.services.plugin.install({ caller: owner, bundle, grant: [] });
  const pluginId: PluginId = installed.id;
  const grant = parseBundle(bundle).manifest.capabilities;
  await root.services.plugin.setGrant({ caller: owner, pluginId, grant, acknowledgedNetHosts: [], enable: true });
  const rpc = await root.internalCallerFor(owner.userId);
  return {
    run: (name, args = "") => rpc.plugin.invokeUiCommand({ pluginId, name, args, chatId: null }),
    // Through the service, which no per-user request bucket meters, so a poll reads the plugin's storage as often as it needs.
    read: async (key): Promise<string | null> => {
      const { resultJson } = await root.services.plugin.uiHostCall({ caller: owner, pluginId, fn: "storage.get", argsJson: JSON.stringify([key]) });
      return z.string().nullable().parse(JSON.parse(resultJson));
    },
  };
}

/** A guest built from source: its slug, its main.js and the capabilities it requests and is granted. */
interface GuestSpec {
  readonly slug: string;
  readonly source: string;
  readonly capabilities: readonly PluginCapability[];
}

function installGuest(root: ServerTestHarness, owner: Principal, { slug, source, capabilities }: GuestSpec): Promise<Installed> {
  const manifest = pluginManifestSchema.parse({
    id: slug,
    name: slug,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Answers what it hears with its own work.",
    capabilities,
  });
  return install(root, owner, makePluginBundle(manifest, source, root.clock.now()));
}

function installRelay(root: ServerTestHarness, owner: Principal, relay: Relay): Promise<Installed> {
  return installGuest(root, owner, { slug: relay.slug, source: relaySource(relay), capabilities: CAPABILITIES });
}

async function stoppedOf(plugin: Installed): Promise<z.infer<typeof stoppedSchema> | null> {
  const stored = await plugin.read(STOPPED_KEY);
  return stored === null ? null : stoppedSchema.parse(JSON.parse(stored));
}

async function deliveriesOf(plugin: Installed): Promise<number> {
  return Number((await plugin.read(DELIVERIES_KEY)) ?? "0");
}

// Every case runs its plugins on one Worker, so a plugin still holding it would hold every other one off.
function oneWorkerRoot(): Promise<ServerTestHarness> {
  return createServerHarness({ pluginSpawn: spawn, env: { ["PLUGIN_BROKER_WORKER_MAX"]: "1" } });
}

test("a plugin that wakes itself through its own channel stops at the delivery depth with its refusal, and holds no Worker after", {
  tags: ["slow"],
  timeout: DEPTH_CASE_TIMEOUT_MS,
}, async () => {
  await using root = await oneWorkerRoot();
  const owner = await root.principalFor(root.ownerId);
  const slug = "self-announcer";
  const self = await installRelay(root, owner, { slug, listens: { emitterSlug: slug, name: "tick" }, emits: "tick" });
  const neighbour = await installRelay(root, owner, { slug: "quiet-neighbour", listens: { emitterSlug: "nobody", name: "tick" }, emits: "tick" });

  await self.run(START);
  // The command runs at depth 0, so its emit opens depth 1 and that delivery's opens the deepest; the last is refused.
  await expect.poll(() => stoppedOf(self), { timeout: POLL_TIMEOUT_MS }).toEqual({ deliveries: PLUGIN_CASCADE_DEPTH_MAX, name: DEPTH_REFUSAL });

  // The only Worker serves another plugin at once, and the loop has run no delivery since its refusal.
  await expect(neighbour.run(NOTE)).resolves.toBeDefined();
  expect(await deliveriesOf(self)).toBe(PLUGIN_CASCADE_DEPTH_MAX);
});

test("two plugins that answer each other's announcements stop at the delivery depth, the reply that would go deeper refused", {
  tags: ["slow"],
  timeout: DEPTH_CASE_TIMEOUT_MS,
}, async () => {
  await using root = await oneWorkerRoot();
  const owner = await root.principalFor(root.ownerId);
  const pinger = await installRelay(root, owner, { slug: "pinger", listens: { emitterSlug: "ponger", name: "pong" }, emits: "ping" });
  const ponger = await installRelay(root, owner, { slug: "ponger", listens: { emitterSlug: "pinger", name: "ping" }, emits: "pong" });

  // The pinger's command opens the ponger's delivery, whose reply opens the pinger's; the pinger's answer is refused.
  await pinger.run(START);
  await expect.poll(() => stoppedOf(pinger), { timeout: POLL_TIMEOUT_MS }).toEqual({ deliveries: 1, name: DEPTH_REFUSAL });
  expect(await deliveriesOf(ponger)).toBe(1);
  expect(await stoppedOf(ponger)).toBeNull();
});

test("the oracle deck's announcement of a draw still reaches scene chips, one delivery deep", { tags: ["slow"], timeout: DEPTH_CASE_TIMEOUT_MS }, async () => {
  await using root = await oneWorkerRoot();
  const owner = await root.principalFor(root.ownerId);
  const oracle = await install(root, owner, await requireShowcaseBundle(ORACLE));
  const chips = await install(root, owner, await requireShowcaseBundle(CHIPS));
  const noted = async (): Promise<boolean> => omenSchema.safeParse(JSON.parse((await chips.read(OMEN_KEY)) ?? "null")).success;
  expect(await noted()).toBe(false);

  await oracle.run(DRAW);
  await expect.poll(noted, { timeout: POLL_TIMEOUT_MS }).toBe(true);
});

const HELD_KEY = "hold";
const LATE_KEY = "late";
const NOW_KEY = "now";
const SENT = "sent";
const FLOATER = "floater";
// The floater's own delivery floats an emit behind a storage read the edge holds, so the emit runs after the floater's
// next command, a human one at depth 0, has started and answered on the same instance.
const FLOATER_SOURCE = `const h = orb.host(1);
const record = async (key, emit) => { try { await emit(); await h.storage.set(key, ${JSON.stringify(SENT)}); } catch (refused) { await h.storage.set(key, refused.name); } };
h.pubsub.on(${JSON.stringify(FLOATER)}, "go", () => {
  void (async () => { await h.storage.get(${JSON.stringify(HELD_KEY)}); await record(${JSON.stringify(LATE_KEY)}, () => h.pubsub.emit(${JSON.stringify(LATE_KEY)}, {})); })();
});
h.ui.registerCommand({ name: ${JSON.stringify(START)}, describe: "Go", onRun: async () => { await h.pubsub.emit("go", {}); } });
h.ui.registerCommand({ name: ${JSON.stringify(NOW_KEY)}, describe: "Announce now", onRun: async () => { await record(${JSON.stringify(NOW_KEY)}, () => h.pubsub.emit(${JSON.stringify(NOW_KEY)}, {})); } });`;
// The echo answers each floater announcement and records whether its answer was admitted, which tells the depth the
// announcement was delivered at: an answer to a depth-1 delivery is admitted, one to the deepest is refused.
const ECHO_SOURCE = `const h = orb.host(1);
for (const name of [${JSON.stringify(LATE_KEY)}, ${JSON.stringify(NOW_KEY)}]) {
  h.pubsub.on(${JSON.stringify(FLOATER)}, name, async () => {
    try { await h.pubsub.emit("echo", {}); await h.storage.set(name, ${JSON.stringify(SENT)}); } catch (refused) { await h.storage.set(name, refused.name); }
  });
}`;
const heldRead = (value: unknown): boolean => hasOperation(value, PLUGIN_PROCESS_OPERATIONS.read) && isDeepStrictEqual(frameField(value, "args"), [HELD_KEY]);

test("a floated emit answers for its own command's depth after a shallower command ran on the instance, and each is delivered at its own", {
  tags: ["slow"],
  timeout: DEPTH_CASE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const owner = await root.principalFor(root.ownerId);
  const floater = await installGuest(root, owner, { slug: FLOATER, source: FLOATER_SOURCE, capabilities: CAPABILITIES });
  const echo = await installGuest(root, owner, { slug: "echo", source: ECHO_SOURCE, capabilities: CAPABILITIES });

  {
    using held = edge.holdNext(heldRead);
    // The floater's command runs at depth 0 and its delivery at depth 1; the delivery returns with its emit floated.
    await floater.run(START);
    await held.reached;
    await floater.run(NOW_KEY);
    await expect.poll(() => echo.read(NOW_KEY), { timeout: POLL_TIMEOUT_MS }).toBe(SENT);
  }

  // Released: the depth-1 delivery's emit is admitted and opens the deepest delivery, whose answer is refused.
  await expect.poll(() => floater.read(LATE_KEY), { timeout: POLL_TIMEOUT_MS }).toBe(SENT);
  await expect.poll(() => echo.read(LATE_KEY), { timeout: POLL_TIMEOUT_MS }).toBe(DEPTH_REFUSAL);
  expect(await floater.read(NOW_KEY)).toBe(SENT);
});

const INGESTER = "self-ingester";
const REFUSAL_LOG_LEVEL = "warn" satisfies LogLevel;
const CARD_KEY = "card";
// A trigger handler that ingests a renamed copy of a card each time it hears of a library character changing: each
// ingest raises `character.updated`, which this installer's own handler hears again.
const INGESTER_SOURCE = `const h = orb.host(1);
const ingestNext = async () => {
  const deliveries = Number((await h.storage.get(${JSON.stringify(DELIVERIES_KEY)})) ?? "0");
  const card = JSON.parse(await h.storage.get(${JSON.stringify(CARD_KEY)}));
  card.data.name = card.data.name + " " + String(deliveries);
  await h.character.ingest(card);
};
h.events.on("character.updated", async () => {
  const deliveries = Number((await h.storage.get(${JSON.stringify(DELIVERIES_KEY)})) ?? "0") + 1;
  await h.storage.set(${JSON.stringify(DELIVERIES_KEY)}, String(deliveries));
  await ingestNext();
});
h.ui.registerCommand({ name: ${JSON.stringify(START)}, describe: "Ingest once", onRun: async ({ args }) => {
  await h.storage.set(${JSON.stringify(CARD_KEY)}, args);
  await ingestNext();
} });`;
const INGESTER_CAPABILITIES = ["ui.surface", "storage.kv", "events.subscribe", "character.ingest"] as const satisfies readonly PluginCapability[];

test("a trigger handler that raises the fact it hears stops at the cascade depth, the next fact not delivered", {
  tags: ["slow"],
  timeout: DEPTH_CASE_TIMEOUT_MS,
}, async () => {
  // The refusal is logged at warn, which the root writes to its ring only at that level or below.
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: REFUSAL_LOG_LEVEL });
  const owner = await root.principalFor(root.ownerId);
  const source = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "echo-source", name: "Echo", description: "A card to copy." }),
  });
  const exported = await root.app.exportService.exportCharacter({ principal: owner, characterId: source.id, format: "json", note: failOnExportNote });
  if (exported === null) {
    throw new Error("the owner's own character did not export");
  }
  const ingester = await installGuest(root, owner, { slug: INGESTER, source: INGESTER_SOURCE, capabilities: INGESTER_CAPABILITIES });
  // The refusal the delivery logs past the bound, the only trace a fact that reaches no handler leaves.
  const refused = (): number =>
    root.observability
      .logLines()
      .filter((line) => line.includes(`"pluginSlug":"${INGESTER}"`) && line.includes(`"cascadeDepth":${String(PLUGIN_CASCADE_DEPTH_MAX + 1)}`)).length;

  // The command runs at depth 0; its ingest's fact runs the handler at depth 1, whose ingest's runs it at the deepest.
  await ingester.run(START, new TextDecoder().decode(exported.bytes));
  await expect.poll(refused, { timeout: POLL_TIMEOUT_MS }).toBe(1);
  expect(await deliveriesOf(ingester)).toBe(PLUGIN_CASCADE_DEPTH_MAX);
});
