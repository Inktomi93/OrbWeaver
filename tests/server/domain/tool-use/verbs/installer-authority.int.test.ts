// A native guest's room ceiling belongs to its installer, not the human who called the tool.

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { chats } from "@orb/db";
import { loadPresentRole } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
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

test("a real resident guest follows fresh installer handoff, departure and disable state without borrowing its caller's host seat", async () => {
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
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: installer.handle } });
  await root.services.chat.acceptInvite({ principal: installer, inviteId: invitation.invite.id });
  const installed = await seedInstalledPlugin(root, {
    caller: installer,
    bundle: zipSync({ [PLUGIN_MANIFEST_ENTRY]: strToU8(JSON.stringify(MANIFEST)), [PLUGIN_MAIN_ENTRY]: strToU8(GUEST) }),
    grant: [],
  });
  const enabled = await seedPluginGrant(root, {
    caller: installer,
    pluginId: installed.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const name = pluginToolWireName(MANIFEST.id, "stamp");
  const runtimeVariables = async (): Promise<(typeof chats.$inferSelect)["runtimeVariables"] | undefined> =>
    (await root.db.select({ values: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId)).get())?.values;
  const invokeAs = async (caller: Principal, value: string): ReturnType<typeof root.app.toolUse.executeToolCalls> => {
    const role = await loadPresentRole(root.db, chatId, caller.userId);
    return await root.app.toolUse.executeToolCalls(
      root.app.toolUse.resolveTools(installer.userId, [name]),
      [{ toolCallId: "installer-ceiling-control", name, arguments: JSON.stringify({ value }) }],
      { principal: caller, triggeredBy: caller.userId, chatId, turnId: null, membership: role === null ? null : { role } },
    );
  };
  const memberAttempt = await invokeAs(owner, "must-not-land");
  expect(memberAttempt).toMatchObject([{ isError: false, result: "Error: plugin host: chat.variables.write requires host authority on this chat" }]);
  expect((await runtimeVariables())?.[VARIABLE]).toBeUndefined();

  await root.services.chat.nominateHostHandoff({ principal: owner, chatId, userId: installer.userId });
  await root.services.chat.acceptHostHandoff({ principal: installer, chatId });
  expect(await invokeAs(owner, "installer-host")).toMatchObject([{ isError: false, result: "applied" }]);
  expect((await runtimeVariables())?.[VARIABLE]).toBe("installer-host");

  await root.services.chat.nominateHostHandoff({ principal: installer, chatId, userId: owner.userId });
  await root.services.chat.acceptHostHandoff({ principal: owner, chatId });
  expect(await invokeAs(owner, "handoff-must-not-land")).toMatchObject([{ isError: false, result: memberAttempt[0]?.result }]);
  await root.services.chat.selfLeave({ principal: installer, chatId });
  const departedAttempt = await invokeAs(owner, "departed-must-not-land");
  expect(departedAttempt).toMatchObject([{ isError: true, result: JSON.stringify({ error: `not permitted: ${name}` }) }]);
  expect((await runtimeVariables())?.[VARIABLE]).toBe("installer-host");

  await root.services.plugin.setEnabled({ caller: installer, pluginId: installed.plugin.id, enabled: false });
  expect(root.app.toolUse.isToolDrivableBy(name, installer.userId)).toBe(false);
  expect(() => root.app.toolUse.resolveTools(installer.userId, [name])).toThrow();
});
