// A room event never reaches a disabled member's plugin, so the guest cannot spend that member's connections on
// it; the next event reaches the guest once the member is re-enabled.
// @subject packages/server/src/domain/automation/substrate/plugin-subscribers.ts

import { spawn } from "node:child_process";
import type { PluginCapability } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  makePluginBundle,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";

const LOG_LIMIT = 20;
const CAPABILITIES = ["chat.read", "events.subscribe", "llm.quiet"] as const satisfies readonly PluginCapability[];
// Each delivered line costs the installer one quiet call on their own Utility connection, then logs what it heard.
const GUEST_SOURCE = `const h = orb.host(1);
h.events.on("messageCommitted", async (fact) => {
  await h.llm.quiet("Note the line.");
  h.log.info(fact.message.content);
});`;

test("a disabled member's plugin hears no room line and spends nothing, and hears the next one once re-enabled", { tags: ["slow"] }, async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Noted.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } });
  const { root, owner, chatId } = h;
  const member = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, member);
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const manifest = pluginManifestSchema.parse({
    id: "line-listener",
    name: "Line listener",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Notes every committed line.",
    capabilities: CAPABILITIES,
  });
  const installed = await root.services.plugin.install({ caller: member, bundle: makePluginBundle(manifest, GUEST_SOURCE, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: member, pluginId: installed.id, grant: [...CAPABILITIES], acknowledgedNetHosts: [], enable: true });
  const heard = async (): Promise<string[]> =>
    (await root.services.plugin.getLog({ caller: member, pluginId: installed.id, limit: LOG_LIMIT })).map((line) => line.message);
  const quietCalls = (): number => h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions")).length;
  const say = (content: string): Promise<unknown> => root.services.chat.commitMessage({ principal: owner, chatId, content });
  const setMemberEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: owner, userId: member.userId, enabled });
  const before = quietCalls();

  await say("The host lights the first lamp.");
  await expect.poll(heard).toContain("The host lights the first lamp.");
  expect(quietCalls()).toBe(before + 1);

  await setMemberEnabled(false);
  await say("The host lights a lamp nobody should hear.");
  // The fan-out runs in automation's own event handling, which settles before the member is re-enabled.
  await root.settleBackground();
  await setMemberEnabled(true);
  await say("The host lights the last lamp.");
  await expect.poll(heard).toContain("The host lights the last lamp.");
  await root.settleBackground();
  expect(await heard()).not.toContain("The host lights a lamp nobody should hear.");
  expect(quietCalls()).toBe(before + 2);
});
