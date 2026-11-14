// A room event never reaches a disabled member's plugin, so the guest cannot spend that member's connections on
// it; the next event reaches the guest once the member is re-enabled. The delivery rechecks the member's standing
// after the fan-out admitted it, so a member disabled while the delivery is queued has no guest run either. A guest
// already running when its member is disabled has every later host call on that member's account refused.
// @subject packages/server/src/domain/automation/engine/plugin-subscribers.ts
// @subject packages/server/src/domain/chat/verbs/plugin-authority.ts
// @subject packages/server/src/domain/plugin/verbs/registrar-ops.ts
// @subject packages/server/src/domain/plugin/substrate/bridge.ts
// @subject packages/server/src/infra/plugin-host/bridge-rpc.ts

import { spawn } from "node:child_process";
import type { PluginCapability } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
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

const LOG_LIMIT = 20;
const CAPABILITIES = ["chat.read", "events.subscribe", "llm.quiet", "storage.kv"] as const satisfies readonly PluginCapability[];
// Each delivered line costs the installer one quiet call on their own Utility connection, then logs what it heard.
const QUIET_THEN_LOG = `const h = orb.host(1);
h.events.on("messageCommitted", async (fact) => {
  await h.llm.quiet("Note the line.");
  h.log.info(fact.message.content);
});`;
// Logs before any host call, so the guest's own log records every run, even one a later host call refuses.
const LOG_THEN_QUIET = `const h = orb.host(1);
h.events.on("messageCommitted", async (fact) => {
  h.log.info(fact.message.content);
  await h.llm.quiet("Note the line.");
});`;
// Reads the plugin's own storage before it spends, then records whether its quiet call ran or was refused.
const STORE_THEN_QUIET = `const h = orb.host(1);
h.events.on("messageCommitted", async (fact) => {
  await h.storage.get("seen");
  try {
    await h.llm.quiet("Note the line.");
    h.log.info("noted " + fact.message.content);
  } catch {
    h.log.info("refused " + fact.message.content);
  }
});`;
// The delivery's own standing read: the fan-out reads the member's visibility row, which selects more columns.
const DELIVERY_STANDING_READ = /^select "role" from "chat_participants"/u;
// The guest's own storage read, which a running guest makes after its delivery passed every standing check.
const GUEST_STORAGE_READ = /from "plugin_kv"/u;

interface ListenerRoom extends AsyncDisposable {
  readonly root: ChatRoot["root"];
  readonly heard: () => Promise<string[]>;
  readonly quietCalls: () => number;
  readonly say: (content: string) => Promise<unknown>;
  readonly setMemberEnabled: (enabled: boolean) => Promise<unknown>;
}

/** A room whose host speaks and whose member runs a line-listening plugin on their own connections. */
async function listenerRoom(guestSource: string, db?: Db): Promise<ListenerRoom> {
  await using construction = new AsyncDisposableStack();
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Noted.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn, ...(db === undefined ? {} : { db }) } }),
  );
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
  const installed = await root.services.plugin.install({ caller: member, bundle: makePluginBundle(manifest, guestSource, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: member, pluginId: installed.id, grant: [...CAPABILITIES], acknowledgedNetHosts: [], enable: true });
  const lifetime = construction.move();
  return {
    root,
    heard: async (): Promise<string[]> =>
      (await root.services.plugin.getLog({ caller: member, pluginId: installed.id, limit: LOG_LIMIT })).map((line) => line.message),
    quietCalls: (): number => h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions")).length,
    say: (content: string): Promise<unknown> => root.services.chat.commitMessage({ principal: owner, chatId, content }),
    setMemberEnabled: (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: owner, userId: member.userId, enabled }),
    [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync(),
  };
}

test("a disabled member's plugin hears no room line and spends nothing, and hears the next one once re-enabled", { tags: ["slow"] }, async () => {
  await using room = await listenerRoom(QUIET_THEN_LOG);
  const before = room.quietCalls();

  await room.say("The host lights the first lamp.");
  await expect.poll(room.heard).toContain("The host lights the first lamp.");
  expect(room.quietCalls()).toBe(before + 1);

  await room.setMemberEnabled(false);
  await room.say("The host lights a lamp nobody should hear.");
  // The fan-out runs in automation's own event handling, which settles before the member is re-enabled.
  await room.root.settleBackground();
  await room.setMemberEnabled(true);
  await room.say("The host lights the last lamp.");
  await expect.poll(room.heard).toContain("The host lights the last lamp.");
  await room.root.settleBackground();
  expect(await room.heard()).not.toContain("The host lights a lamp nobody should hear.");
  expect(room.quietCalls()).toBe(before + 2);
});

test("a member disabled after the fan-out admits a line and before its delivery runs has no guest run, and hears the next line once re-enabled", {
  tags: ["slow"],
}, async () => {
  using held = await freshHeldDb();
  await using room = await listenerRoom(LOG_THEN_QUIET, held.db);
  const before = room.quietCalls();

  await room.say("The host lights the first lamp.");
  await expect.poll(room.heard).toContain("The host lights the first lamp.");
  await expect.poll(room.quietCalls).toBe(before + 1);

  // The fan-out has admitted the enabled member; the queued delivery parks on its own standing read.
  const delivery = held.hold(DELIVERY_STANDING_READ);
  const saying = room.say("The host lights a lamp nobody should hear.");
  await delivery.reached;
  delivery.disarm();
  await room.setMemberEnabled(false);
  delivery.release();
  await saying;
  await room.root.settleBackground();

  await room.setMemberEnabled(true);
  await room.say("The host lights the last lamp.");
  await expect.poll(room.heard).toContain("The host lights the last lamp.");
  await expect.poll(room.quietCalls).toBe(before + 2);
  expect(await room.heard()).not.toContain("The host lights a lamp nobody should hear.");
});

test("a running guest whose member is disabled has its quiet call refused and spends nothing", { tags: ["slow"] }, async () => {
  using held = await freshHeldDb();
  await using room = await listenerRoom(STORE_THEN_QUIET, held.db);
  const before = room.quietCalls();

  await room.say("The host lights the first lamp.");
  await expect.poll(room.heard).toContain("noted The host lights the first lamp.");
  await expect.poll(room.quietCalls).toBe(before + 1);

  // The delivery passed every standing check and the guest is running; it parks on its own storage read.
  const guestRead = held.hold(GUEST_STORAGE_READ);
  const saying = room.say("The host lights a lamp on a closed account.");
  await guestRead.reached;
  guestRead.disarm();
  await room.setMemberEnabled(false);
  guestRead.release();
  await saying;

  await expect.poll(room.heard).toContain("refused The host lights a lamp on a closed account.");
  expect(await room.heard()).not.toContain("noted The host lights a lamp on a closed account.");
  expect(room.quietCalls()).toBe(before + 1);
});
