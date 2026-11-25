// An upgrade that turns `matchAutomationEvents` on and is refused keeps the opt-in off through a plain re-enable: the
// plugin hears a human's line but not the reply its own command caused, and hears that reply once a covering grant
// answers the question.
// @subject packages/server/src/domain/plugin/activation/activate.ts
// @subject packages/server/src/domain/plugin/verbs/set-enabled.ts
import { spawn } from "node:child_process";
import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { makePluginBundle } from "@orb/testkit/node/composed";
import { textRoom } from "../../chat/scenario-physical.ts";

const COMMAND = "request_turn";
const CAPABILITIES = ["ui.surface", "chat.read", "turn.trigger", "events.subscribe"] as const satisfies readonly PluginCapability[];
// Each heard line is logged with its role, so a plugin-caused reply (depth 1) is told apart from a human line (depth 0).
const GUEST = `const h = orb.host(1);
h.events.on("messageCommitted", (fact) => { h.log.info(fact.message.role + ":" + fact.message.content); });
h.ui.registerCommand({ name: ${JSON.stringify(COMMAND)}, describe: "Request a room turn", onRun: async () => { await h.chat.requestTurn(h.chat.current()); } });`;
const WITHHELD_REPLY = "The reply the plugin may not hear.";
const ANSWERED_REPLY = "The reply the plugin hears once it is answered.";
const HUMAN_LINE = "The host speaks.";

function manifestOf(version: string, over: Partial<PluginManifest>): PluginManifest {
  return pluginManifestSchema.parse({
    id: "cascade-listener",
    name: "Cascade listener",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Hears committed lines and requests turns.",
    capabilities: CAPABILITIES,
    ...over,
  });
}

test("a refused automation opt-in stays off on re-enable, so a plugin-caused reply is not delivered until a covering grant", {
  tags: ["slow"],
}, async () => {
  await using h = await textRoom([WITHHELD_REPLY, ANSWERED_REPLY], { server: { pluginSpawn: spawn } });
  const { root, owner: caller, chatId } = h;
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifestOf("1.0.0", {}), GUEST, root.clock.now()), grant: [] });
  const pluginId = installed.id;
  await root.services.plugin.setGrant({ caller, pluginId, grant: [...CAPABILITIES], acknowledgedNetHosts: [], enable: true });
  const heard = async (): Promise<string[]> => (await root.services.plugin.getLog({ caller, pluginId })).map(({ message }) => message);
  const requestTurn = (): Promise<unknown> =>
    root.services.plugin.invokeUiCommand({ caller, pluginId, name: COMMAND, args: "", chatId, signal: new AbortController().signal });

  const upgraded = await root.services.plugin.upgrade({
    caller,
    pluginId,
    bundle: makePluginBundle(manifestOf("1.1.0", { matchAutomationEvents: true }), GUEST, root.clock.now()),
  });
  expect(upgraded).toMatchObject({ status: "disabled", reconsentPending: true, widenedMatchAutomationEvents: true });
  await root.services.plugin.setEnabled({ caller, pluginId, enabled: true });

  await requestTurn();
  await root.settleBackground();
  await root.services.chat.commitMessage({ principal: caller, chatId, content: HUMAN_LINE });
  // The human line is delivered, so the listener is live and an absent reply was withheld, not lost.
  await expect.poll(heard).toContain(`user:${HUMAN_LINE}`);
  await root.settleBackground();
  expect(await heard()).not.toContain(`assistant:${WITHHELD_REPLY}`);

  const answered = await root.services.plugin.setGrant({
    caller,
    pluginId,
    grant: [...CAPABILITIES],
    acknowledgedNetHosts: [],
    acknowledgedProviderIds: [],
    acknowledgedMatchAutomationEvents: upgraded.matchAutomationEvents,
    enable: true,
  });
  expect(answered).toMatchObject({ status: "enabled", reconsentPending: false, matchAutomationEvents: true });
  await requestTurn();
  await expect.poll(heard).toContain(`assistant:${ANSWERED_REPLY}`);
});
