// A native guest's room ceiling belongs to its installer, not the human who called the tool.

import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import type { AutomationRuleId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedAutomationRule,
  seedCorpusActors,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { strToU8, zipSync } from "fflate";

const VARIABLE = "installer_authority_marker";
const MANIFEST = pluginManifestSchema.parse({
  id: "authority-control",
  name: "Installer authority control",
  description: "Exercises the installer's current room write ceiling.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["tools.register", "chat.read", "chat.variables.write"],
});
const GUEST = `const host = orb.host(1);
host.tools.register({
  name: "stamp",
  description: "Write the installer authority marker.",
  parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
  handler: async (args) => {
    try {
      const result = await host.chat.applyVariableOps(host.chat.current(), [{ op: "set", key: ${JSON.stringify(VARIABLE)}, value: args.value }]);
      return result.outcome;
    } catch (error) {
      return error.name + ": " + error.message;
    }
  }
});`;

const RESULT_KEY = "installer_authority_result";

test("a rule the installer authored runs its guest tool on the installer's current seat, never the host who pressed Run", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ pluginSpawn: spawn, providerFetch: provider.execute });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const installer = await root.principalFor(secondUserId);
  const room = await root.services.chat.startChat({ principal: installer, characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  const invitation = await root.services.chat.createInvite({ principal: installer, chatId, input: { invitedHandle: owner.handle } });
  await root.services.chat.acceptInvite({ principal: owner, inviteId: invitation.invite.id });
  const installed = await seedInstalledPlugin(root, {
    caller: installer,
    bundle: zipSync({ [PLUGIN_MANIFEST_ENTRY]: strToU8(JSON.stringify(MANIFEST)), [PLUGIN_MAIN_ENTRY]: strToU8(GUEST) }),
    grant: [],
  });
  const enabled = await seedPluginGrant(root, {
    caller: installer,
    pluginId: installed.outcome.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const name = pluginToolWireName(MANIFEST.id, "stamp");
  const stamping = async (value: string): Promise<AutomationRuleId> => {
    const rule = await seedAutomationRule(root, {
      principal: installer,
      chatId,
      name: `Installer authority control ${value}`,
      timeZone: UTC_TIME_ZONE,
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "run_tool", name, argsTemplate: JSON.stringify({ value }), resultVar: RESULT_KEY, resultScope: "global" }],
    });
    await root.services.automation.setRuleEnabled({ principal: installer, ruleId: rule.id, enabled: true });
    return rule.id;
  };
  const hostRule = await stamping("installer-host");
  const handedBackRule = await stamping("after-handback");
  const runtimeVariables = async (): Promise<Record<string, string>> => await root.services.chat.getRuntimeVariables({ principal: installer, chatId });
  const outcomeOf = async (): Promise<string | null> => await root.services.automation.getGlobalVariable({ principal: installer, key: RESULT_KEY });

  // The installer hosts the room, so the guest's write lands.
  expect(await root.services.automation.runRuleNow({ principal: installer, ruleId: hostRule })).toEqual({ outcome: "fired" });
  expect(await outcomeOf()).toBe("applied");
  expect((await runtimeVariables())[VARIABLE]).toBe("installer-host");

  // After the handoff the installer is a member: the owner, now host, presses Run and the rule is refused, so the
  // host's seat never stands in for its author's.
  await root.services.chat.nominateHostHandoff({ principal: installer, chatId, userId: owner.userId });
  await root.services.chat.acceptHostHandoff({ principal: owner, chatId });
  expect(await root.services.automation.runRuleNow({ principal: owner, ruleId: handedBackRule })).toEqual({ outcome: "authority_refused" });
  expect((await runtimeVariables())[VARIABLE]).toBe("installer-host");

  // Handed back, the installer's seat is host again and the same rule lands its write.
  await root.services.chat.nominateHostHandoff({ principal: owner, chatId, userId: installer.userId });
  await root.services.chat.acceptHostHandoff({ principal: installer, chatId });
  expect(await root.services.automation.runRuleNow({ principal: installer, ruleId: handedBackRule })).toEqual({ outcome: "fired" });
  expect((await runtimeVariables())[VARIABLE]).toBe("after-handback");

  await root.services.plugin.setEnabled({ caller: installer, pluginId: installed.outcome.id, enabled: false });
  expect((await root.services.automation.runRuleNow({ principal: installer, ruleId: hostRule })).outcome).not.toBe("fired");
});
