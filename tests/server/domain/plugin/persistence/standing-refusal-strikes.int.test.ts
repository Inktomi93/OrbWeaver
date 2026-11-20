// A host call refused because the plugin's installer is disabled is not the plugin's crash: a running guest that
// leaves such a refusal uncaught keeps its plugin enabled and its crash count still, however often it happens, and
// runs again once its installer is enabled. A guest's own throw still counts. The crash count is read from the
// plugin's row, which no door shows.
// @subject packages/server/src/domain/plugin/activation/activate.ts
// @subject packages/server/src/infra/plugin-host/process-runtime.ts

import { spawn } from "node:child_process";
import type { PluginCapability, PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  freshHeldDb,
  makePluginBundle,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";

const ENABLED = "enabled" satisfies PluginStatus;
const LOG_LIMIT = 50;
const CAPABILITIES = ["chat.read", "events.subscribe", "llm.quiet", "storage.kv"] as const satisfies readonly PluginCapability[];
const CRASH_LINE = "Crash: the host drops the lamp.";
const CRASH_MESSAGE = "the lamp broke";
// A crash line throws the guest's own error. Any other line reads the plugin's storage, then spends a quiet call on the
// installer's account with no catch around it; the `finally` records that the call settled and lets a refusal end the
// invocation uncaught.
const GUEST_SOURCE = `const h = orb.host(1);
h.events.on("messageCommitted", async (fact) => {
  const line = fact.message.content;
  if (line === ${JSON.stringify(CRASH_LINE)}) {
    throw new Error(${JSON.stringify(CRASH_MESSAGE)});
  }
  await h.storage.get("seen");
  try {
    await h.llm.quiet("Note the line.");
    h.log.info("noted " + line);
  } finally {
    h.log.info("settled " + line);
  }
});`;
// The guest's own storage read, which a running guest makes after its delivery passed every standing check.
const GUEST_STORAGE_READ = /from "plugin_kv"/u;

test("a guest that leaves a disabled installer's refusal uncaught is never struck, runs again once re-enabled, and its own throw still counts", {
  tags: ["slow"],
}, async () => {
  using held = await freshHeldDb();
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Noted.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn, db: held.db } });
  const { root, owner, chatId } = h;
  const member = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, member);
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const manifest = pluginManifestSchema.parse({
    id: "lamp-noter",
    name: "Lamp noter",
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
  const view = async (): Promise<{ readonly status: PluginStatus | undefined; readonly lastError: string | null | undefined; readonly crashes: number }> => {
    const listed = (await root.services.plugin.list({ caller: member })).find(({ id }) => id === installed.id);
    const { plugin } = await capturePluginRows(root.db, member.userId, installed.id);
    return { status: listed?.status, lastError: listed?.lastError, crashes: plugin.consecutiveCrashes };
  };

  const spent = quietCalls();
  // Each round, the guest is running and parked on its storage read when its installer is disabled, so its quiet call
  // is refused and the refusal ends the invocation uncaught.
  for (let round = 1; round <= PLUGIN_CRASH_DISABLE_THRESHOLD; round += 1) {
    const line = `The host lights lamp ${String(round)}.`;
    await setMemberEnabled(true);
    const guestRead = held.hold(GUEST_STORAGE_READ);
    const saying = say(line);
    await guestRead.reached;
    guestRead.disarm();
    await setMemberEnabled(false);
    guestRead.release();
    await saying;
    await expect.poll(heard).toContain(`settled ${line}`);
    await root.settleBackground();
    expect(await heard()).not.toContain(`noted ${line}`);
  }
  expect(quietCalls()).toBe(spent);
  expect(await view()).toEqual({ status: ENABLED, lastError: null, crashes: 0 });

  await setMemberEnabled(true);
  await say("The host lights the last lamp.");
  await expect.poll(heard).toContain("noted The host lights the last lamp.");
  expect(quietCalls()).toBe(spent + 1);

  await say(CRASH_LINE);
  await root.settleBackground();
  await expect.poll(async () => (await view()).crashes).toBe(1);
  expect(await view()).toMatchObject({ status: ENABLED, lastError: expect.stringContaining(CRASH_MESSAGE) });
});
