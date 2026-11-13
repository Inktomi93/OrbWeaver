// A display transform runs on every render, so its host calls read and never write or spend: from a display call the
// bridge refuses a write and a spend with the capability refusal, while the same calls succeed from a command, and a
// read succeeds from either.
// @subject packages/server/src/infra/plugin-host/bridge-rpc.ts
// @subject packages/server/src/domain/plugin/activation/activate.ts

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";

const NET_HOST = "display.example.test";
const PAGE_URL = `https://${NET_HOST}/page`;
const LEDGER_KEY = "ledger";
const OK = "ok:";
// One call per effect class. Each display row and each command reports `ok:` and the call's result as JSON, or the
// rejection's name and message.
const EFFECTS = ["read", "write", "spend"] as const;
type Effect = (typeof EFFECTS)[number];
const CALLS = {
  read: `h.storage.get(${JSON.stringify(LEDGER_KEY)})`,
  write: `h.storage.set(${JSON.stringify(LEDGER_KEY)}, "written by " + from)`,
  spend: `h.net.fetch(${JSON.stringify(PAGE_URL)})`,
} as const satisfies Record<Effect, string>;
const GUEST = `const h = orb.host(1);
const calls = { ${EFFECTS.map((effect) => `${effect}: (from) => ${CALLS[effect]}`).join(", ")} };
const attempt = async (effect, from) => { try { return ${JSON.stringify(OK)} + JSON.stringify((await calls[effect](from)) ?? null); } catch (e) { return e.name + ": " + e.message; } };
h.transforms.registerDisplay({ name: "probe", apply: async ({ text }) => attempt(text, "display") });
${EFFECTS.map((effect) => `h.ui.registerCommand({ name: ${JSON.stringify(effect)}, describe: "Probe one call", onRun: async () => { h.log.info(await attempt(${JSON.stringify(effect)}, "command")); } });`).join("\n")}`;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: "displayprobe",
    name: "Display probe",
    version: "1.0.0",
    description: "Tries one read, one write and one spend from a display transform and from a command.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform", "ui.surface", "storage.kv", "net.fetch"],
    netHosts: [NET_HOST],
  });
}

interface Probe {
  readonly display: (effect: Effect) => Promise<string>;
  readonly command: (effect: Effect) => Promise<string | undefined>;
  /** Plugin egress requests that left the box, in arrival order. */
  readonly reached: readonly string[];
}

async function installProbe(root: ServerTestHarness, reached: readonly string[]): Promise<Probe> {
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [NET_HOST], enable: true });
  const pluginId: PluginId = installed.outcome.id;
  const rpc = await root.internalCallerFor(root.ownerId);
  const chatId = root.idSource.typeId(ID_PREFIX.chat);
  const messageId = root.idSource.typeId(ID_PREFIX.message);
  return {
    display: async (effect): Promise<string> => (await rpc.plugin.transformForDisplay({ chatId, messageId, text: effect })).text,
    command: async (effect): Promise<string | undefined> => {
      const before = (await root.services.plugin.getLog({ caller: owner, pluginId })).length;
      await rpc.plugin.invokeUiCommand({ pluginId, name: effect, args: "{}", chatId: null });
      return (await root.services.plugin.getLog({ caller: owner, pluginId })).slice(before).at(-1)?.message;
    },
    reached,
  };
}

test("a display call reads, and its write and spend are refused while a command's succeed", { tags: ["slow"] }, async () => {
  const reached: string[] = [];
  const network: typeof fetch = (input, init) => {
    reached.push(new Request(input, init).url);
    return Promise.resolve(new Response("A page."));
  };
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { fetch: network, resolver: (host) => Promise.resolve([host === NET_HOST ? PUBLIC_PEER_ADDRESS : "127.0.0.1"]) },
  });
  const probe = await installProbe(root, reached);

  const nothingStored = `${OK}null`;
  expect(await probe.display("read")).toBe(nothingStored);
  expect((await probe.display("write")).startsWith(OK)).toBe(false);
  expect((await probe.display("spend")).startsWith(OK)).toBe(false);
  // The refused write stored nothing, and the refused fetch never left the box.
  expect(await probe.command("read")).toBe(nothingStored);
  expect(probe.reached).toEqual([]);

  // Control: the same write and spend from a command succeed, their effects land, and a display call reads the write.
  expect(await probe.command("write")).toBe(nothingStored);
  expect((await probe.command("spend"))?.startsWith(OK)).toBe(true);
  expect(probe.reached).toEqual([PAGE_URL]);
  expect(await probe.display("read")).toBe(`${OK}${JSON.stringify("written by command")}`);
});
