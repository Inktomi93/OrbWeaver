// A pubsub delivery runs one level deeper than the invocation whose emit opened it, and an emit whose deliveries would
// pass `PLUGIN_PUBSUB_DELIVERY_DEPTH_MAX` is refused with `PluginPubsubDepthError`. So a plugin that wakes itself, or two
// that wake each other, stop at that depth through the composed root and a real broker, while the shipped one-hop
// composition, the oracle deck announcing a draw to scene chips, still delivers.
// @subject packages/server/src/domain/plugin/substrate/bridge.ts
// @subject packages/server/src/domain/plugin/substrate/plugin-event-bus.ts
// @subject packages/server/src/infra/plugin-host/bridge-rpc.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_PUBSUB_DELIVERY_DEPTH_MAX, PluginPubsubDepthError, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { parseBundle } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, requireShowcaseBundle } from "@orb/testkit/node/composed";
import { z } from "zod";

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
  readonly run: (name: string) => Promise<unknown>;
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
    run: (name) => rpc.plugin.invokeUiCommand({ pluginId, name, args: "", chatId: null }),
    // Through the service, which no per-user request bucket meters, so a poll reads the plugin's storage as often as it needs.
    read: async (key): Promise<string | null> => {
      const { resultJson } = await root.services.plugin.uiHostCall({ caller: owner, pluginId, fn: "storage.get", argsJson: JSON.stringify([key]) });
      return z.string().nullable().parse(JSON.parse(resultJson));
    },
  };
}

function installRelay(root: ServerTestHarness, owner: Principal, relay: Relay): Promise<Installed> {
  const manifest = pluginManifestSchema.parse({
    id: relay.slug,
    name: relay.slug,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Answers each announcement it hears with its own.",
    capabilities: CAPABILITIES,
  });
  return install(root, owner, makePluginBundle(manifest, relaySource(relay), root.clock.now()));
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
  await expect.poll(() => stoppedOf(self), { timeout: POLL_TIMEOUT_MS }).toEqual({ deliveries: PLUGIN_PUBSUB_DELIVERY_DEPTH_MAX, name: DEPTH_REFUSAL });

  // The only Worker serves another plugin at once, and the loop has run no delivery since its refusal.
  await expect(neighbour.run(NOTE)).resolves.toBeDefined();
  expect(await deliveriesOf(self)).toBe(PLUGIN_PUBSUB_DELIVERY_DEPTH_MAX);
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
