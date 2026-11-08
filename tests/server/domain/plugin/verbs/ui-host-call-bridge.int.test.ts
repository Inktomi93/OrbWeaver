// A member's plugin reaches the bridge through the Tier-C relay: canon reads carry the installer's own history floor and
// hidden-content verdict, and the variable operations are closed over the installer, never a name the caller composed.
// @subject packages/server/src/domain/plugin/verbs/ui-host-call.ts
// @subject packages/server/src/domain/plugin/substrate/bridge.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedCorpusActors } from "@orb/testkit/node/composed";
import { z } from "zod";

const SECRET = "the keeper's hidden truth";
const manifest = pluginManifestSchema.parse({
  id: "relay-reader",
  name: "Relay reader",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Reads the room through the relay.",
  capabilities: ["chat.read", "global_vars"],
});
const messagesSchema = z.array(z.object({ id: z.string(), content: z.string() }));

async function enabledPlugin(root: ServerTestHarness, caller: Principal): Promise<PluginId> {
  const installed = await root.services.plugin.install({
    caller,
    bundle: makePluginBundle(manifest, "// relay reader", root.clock.now()),
    grant: manifest.capabilities,
  });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return installed.id;
}

async function room(root: ServerTestHarness): Promise<{
  readonly host: Principal;
  readonly member: Principal;
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
  readonly before: string;
  readonly after: string;
}> {
  const { owner: host, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const started = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const chatId = started.chat.id;
  const before = await root.services.chat.commitMessage({ principal: host, chatId, content: "Before the member arrived." });
  // The member's floor is inclusive: the last line committed before the invite is the first line they may read.
  await root.services.chat.commitMessage({ principal: host, chatId, content: "The member is invited." });
  const invitation = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await root.services.chat.setMemberHistoryVisibility({ principal: host, chatId, userId: member.userId, visibility: "from-join" });
  const after = await root.services.chat.commitMessage({
    principal: host,
    chatId,
    content: `After the member arrived. <lie character="Keeper" truth="${SECRET}"/>`,
  });
  return { host, member, chatId, before: before.messages[0]?.id ?? "", after: after.messages[0]?.id ?? "" };
}

test("a member's plugin reads canon from its installer's history floor with hidden spans stripped, and a host's plugin reads it all", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { host, member, chatId, before, after } = await room(root);
  const memberPlugin = await enabledPlugin(root, member);
  const hostPlugin = await enabledPlugin(root, host);
  const read = async (caller: Principal, pluginId: PluginId): Promise<z.infer<typeof messagesSchema>> =>
    messagesSchema.parse(JSON.parse((await root.services.plugin.uiHostCall({ caller, pluginId, chatId, fn: "chat.listMessages", argsJson: "[]" })).resultJson));

  const hostSees = await read(host, hostPlugin);
  expect(hostSees.map((row) => row.id)).toEqual(expect.arrayContaining([before, after]));
  expect(hostSees.find((row) => row.id === after)?.content).toContain(SECRET);

  const memberSees = await read(member, memberPlugin);
  expect(memberSees.map((row) => row.id)).toContain(after);
  expect(memberSees.map((row) => row.id)).not.toContain(before);
  expect(present(memberSees.find((row) => row.id === after)).content).not.toContain(SECRET);
});

test("variable operations are closed over the installer: each user's plugin sees only its own values", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { host, member, chatId } = await room(root);
  const memberPlugin = await enabledPlugin(root, member);
  const hostPlugin = await enabledPlugin(root, host);
  const call = async (caller: Principal, pluginId: PluginId, fn: string, args: readonly string[]): Promise<unknown> =>
    JSON.parse((await root.services.plugin.uiHostCall({ caller, pluginId, chatId, fn, argsJson: JSON.stringify(args) })).resultJson);

  await call(member, memberPlugin, "variables.set", ["mood", "wary"]);
  expect(await call(member, memberPlugin, "variables.get", ["mood"])).toBe("wary");
  expect(await call(host, hostPlugin, "variables.get", ["mood"])).toBeNull();

  await call(host, hostPlugin, "variables.set", ["mood", "calm"]);
  expect(await call(member, memberPlugin, "variables.get", ["mood"])).toBe("wary");
  expect(await call(host, hostPlugin, "variables.get", ["mood"])).toBe("calm");

  await call(member, memberPlugin, "variables.delete", ["mood"]);
  expect(await call(member, memberPlugin, "variables.get", ["mood"])).toBeNull();
  expect(await call(host, hostPlugin, "variables.get", ["mood"])).toBe("calm");
});
