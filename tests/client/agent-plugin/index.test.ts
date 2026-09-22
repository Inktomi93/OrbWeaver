// Unit: `buildAgentPlugin` — the read-only `__orb.pluginLog(ref?)` impl. It must list the installed plugins with no ref,
// resolve a ref by slug OR id through the production `plugin.getLog` read, and REFUSE loudly (never a silent
// empty) on no match or an ambiguous one — the same loud-refusal contract `__orb.nav` carries.

import { buildAgentPlugin } from "@orb/client/agent-plugin";
import { typeIdSchema } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

type AgentPluginClient = Parameters<typeof buildAgentPlugin>[0];
type InstalledPlugins = Awaited<ReturnType<AgentPluginClient["plugin"]["list"]["query"]>>;
interface FakeAgentPluginClient {
  readonly plugin: {
    readonly list: { readonly query: Mock<AgentPluginClient["plugin"]["list"]["query"]> };
    readonly getLog: { readonly query: Mock<AgentPluginClient["plugin"]["getLog"]["query"]> };
  };
}

const pluginId = typeIdSchema("plugin");
const ATLAS = {
  id: pluginId.parse("plugin_01j00000000000000000000000"),
  slug: "card-atlas",
  name: "Card Atlas",
  version: "1.3.2",
  status: "enabled",
  extra: "ignored",
} as const;
const DECK = {
  id: pluginId.parse("plugin_01j00000000000000000000001"),
  slug: "oracle-deck",
  name: "Oracle Deck",
  version: "1.0.0",
  status: "disabled",
} as const;
const LOG = [{ level: "warn", message: "search failed: Error: Date.parse is disabled in the plugin sandbox", at: 1 }] as const;

function fakeClient(plugins: InstalledPlugins = [ATLAS, DECK]): FakeAgentPluginClient {
  const fake = {
    plugin: {
      list: { query: vi.fn<AgentPluginClient["plugin"]["list"]["query"]>().mockResolvedValue(plugins) },
      getLog: { query: vi.fn<AgentPluginClient["plugin"]["getLog"]["query"]>().mockResolvedValue(LOG) },
    },
  } satisfies FakeAgentPluginClient;
  return fake;
}

test("no ref lists the installed plugins (id · slug · name · version · status) without reading any log", async () => {
  const client = fakeClient();
  const read = buildAgentPlugin(client);
  await expect(read()).resolves.toEqual({
    ok: true,
    plugins: [
      { id: ATLAS.id, slug: "card-atlas", name: "Card Atlas", version: "1.3.2", status: "enabled" },
      { id: DECK.id, slug: "oracle-deck", name: "Oracle Deck", version: "1.0.0", status: "disabled" },
    ],
  });
  expect(client.plugin.getLog.query).not.toHaveBeenCalled();
});

test("a slug ref reads that plugin's runtime log through the production getLog read", async () => {
  const client = fakeClient();
  const read = buildAgentPlugin(client);
  await expect(read("card-atlas")).resolves.toEqual({
    ok: true,
    plugin: { id: ATLAS.id, slug: "card-atlas", name: "Card Atlas", version: "1.3.2", status: "enabled" },
    log: LOG,
  });
  expect(client.plugin.getLog.query).toHaveBeenCalledExactlyOnceWith({ pluginId: ATLAS.id });
});

test("an id ref resolves too", async () => {
  const client = fakeClient();
  const read = buildAgentPlugin(client);
  await expect(read(DECK.id)).resolves.toMatchObject({ ok: true, plugin: { slug: "oracle-deck" } });
  expect(client.plugin.getLog.query).toHaveBeenCalledExactlyOnceWith({ pluginId: DECK.id });
});

test("an unknown ref is a LOUD refusal naming the installed slugs, and reads no log", async () => {
  const client = fakeClient();
  const read = buildAgentPlugin(client);
  const result = await read("nope");
  expect(result.ok).toBe(false);
  expect(result).toMatchObject({ reason: expect.stringContaining("card-atlas, oracle-deck") });
  expect(client.plugin.getLog.query).not.toHaveBeenCalled();
});

test("an ambiguous ref (two rows sharing a slug) refuses and asks for the id", async () => {
  const twin = { ...DECK, id: pluginId.parse("plugin_01j00000000000000000000002") };
  const client = fakeClient([DECK, twin]);
  const read = buildAgentPlugin(client);
  await expect(read("oracle-deck")).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("pass the id") });
  expect(client.plugin.getLog.query).not.toHaveBeenCalled();
});
