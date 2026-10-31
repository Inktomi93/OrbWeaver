// @subject packages/server/src/domain/tool-use/teaching-contribution.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import type { UserConnectionId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, ServerTestHarness } from "@orb/testkit/node/composed";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { beforeAll } from "vitest";
import type { CoreWireReply } from "../engine/core-physical.ts";
import { coreFrame, coreHttpRoom, coreSse } from "../engine/core-physical.ts";
import { createToolsConnection, startCoreChat, turnWireBody } from "./turn-rpg-physical.ts";

const MANIFEST = pluginManifestSchema.parse({
  id: "teaching-policy",
  name: "Teaching policy witness",
  description: "A native guest whose registration belongs to its actual installer.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["tools.register"],
});
const LOCAL_NAME = "report_mood";
const WIRE_NAME = pluginToolWireName(MANIFEST.id, LOCAL_NAME);
const HOST_DESCRIPTION = "The host's own mood report.";
const FOREIGN_DESCRIPTION = "The first stranger's mood report.";

async function installGuest(root: ServerTestHarness, caller: Principal, description: string): ReturnType<typeof seedPluginGrant> {
  const source = `const host = orb.host(1); host.tools.register({name:${JSON.stringify(LOCAL_NAME)}, description:${JSON.stringify(description)}, parameters:{type:"object",properties:{},additionalProperties:false}, handler:async()=>"calm"});`;
  const installed = await seedInstalledPlugin(root, {
    caller,
    bundle: makePluginBundle(MANIFEST, source, root.clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrant(root, {
    caller,
    pluginId: installed.outcome.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  return enabled;
}

function prose(): Response {
  return coreSse([
    coreFrame({ choices: [{ delta: { content: "The keeper finishes the offered turn." } }] }),
    terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
  ]);
}

// One root for the file: the guest host is a spawned process, so a case sets the guest state and the saved model it
// needs through the public doors instead of booting its own root. The plan feeds each physical request to the
// current case's reply, and a request nobody planned fails like an exhausted finite plan.
const PLAN_SLOTS = 8;
const plan: CoreWireReply[] = [];
const wires: Awaited<ReturnType<typeof turnWireBody>>[] = [];
const shared = Promise.withResolvers<PolicyRoom>();

interface PolicyRoom {
  readonly h: ChatRoot;
  readonly incapable: UserConnectionId;
  readonly capable: UserConnectionId;
}

function planned(...replies: readonly CoreWireReply[]): void {
  plan.splice(0, plan.length, ...replies);
  wires.length = 0;
}

function recording(): CoreWireReply {
  return async (request): Promise<Response> => {
    wires.push(await turnWireBody(request));
    return prose();
  };
}

beforeAll(async (): Promise<() => Promise<void>> => {
  await using construction = new AsyncDisposableStack();
  const dispatch: CoreWireReply = (request) => {
    const reply = plan.shift();
    if (reply === undefined) {
      throw new Error("the finite teaching-policy reply plan is exhausted");
    }
    return reply(request);
  };
  const h = construction.use(
    await coreHttpRoom(
      Array.from({ length: PLAN_SLOTS }, () => dispatch),
      { server: { pluginSpawn: spawn } },
    ),
  );
  const bound = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding?.connectionId;
  if (bound === undefined || bound === null) {
    throw new Error("the core room has no actual chat binding");
  }
  const capable = (await createToolsConnection(h)).id;
  // The cold guest activation dominates a loaded case, so the hook pays it once and the cases only re-enable a warm host.
  await installGuest(h.root, h.owner, HOST_DESCRIPTION);
  shared.resolve({ h, incapable: bound, capable });
  const lifetime = construction.move();
  return () => lifetime.disposeAsync();
});

/** Bring the owner's own copy of the guest to the state a case starts from: installed and enabled, or not installed at all. */
async function ownerGuest(h: ChatRoot, present: boolean): Promise<void> {
  const own = (await h.root.services.plugin.list({ caller: h.owner })).find(({ slug }) => slug === MANIFEST.id);
  if (!present) {
    if (own !== undefined) {
      await h.root.services.plugin.uninstall({ caller: h.owner, pluginId: own.id });
    }
    return;
  }
  if (own === undefined) {
    await installGuest(h.root, h.owner, HOST_DESCRIPTION);
    return;
  }
  await h.root.services.plugin.setEnabled({ caller: h.owner, pluginId: own.id, enabled: true });
}

const ABSENCE_ROWS = [
  { label: "an installed contributor on a tools-incapable saved model", installed: true, capable: false },
  { label: "a tools-capable saved model with no contributor", installed: false, capable: true },
] as const;

test.for(ABSENCE_ROWS)("public SEND omits tools for $label", async (row) => {
  const { h, incapable, capable } = await shared.promise;
  planned(recording());
  await ownerGuest(h, row.installed);
  await h.caller.connection.setBinding({ task: "chat", connectionId: row.capable ? capable : incapable });
  const chatId = await startCoreChat(h);
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId).includes(WIRE_NAME)).toBe(row.installed);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId, content: "Reply without an attachable tool." });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([
    { content: "The keeper finishes the offered turn.", toolCalls: [] },
  ]);
  expect(wires).toHaveLength(1);
  expect(wires[0]?.["tools"]).toBeUndefined();
});

test("native plugin deactivation removes its tool from the next actual SEND rather than leaving a stale attach list", async () => {
  const { h, capable } = await shared.promise;
  planned(recording(), recording());
  await ownerGuest(h, true);
  await h.caller.connection.setBinding({ task: "chat", connectionId: capable });
  const chatId = await startCoreChat(h);
  const own = (await h.root.services.plugin.list({ caller: h.owner })).find(({ slug }) => slug === MANIFEST.id);
  if (own === undefined) {
    throw new Error("the owner's installed guest is not listed");
  }
  const params = { principal: h.owner, chatId, content: "Describe this beat." };
  expect((await h.root.services.chat.send(params)).aborted).toBe(false);
  expect(JSON.stringify(wires[0]?.["tools"])).toContain(WIRE_NAME);
  await h.root.services.plugin.setEnabled({ caller: h.owner, pluginId: own.id, enabled: false });
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId)).not.toContain(WIRE_NAME);
  expect((await h.root.services.chat.send(params)).aborted).toBe(false);
  expect(wires).toHaveLength(2);
  expect(wires[1]?.["tools"]).toBeUndefined();
});

test("two real installers with the same namespaced tool attach the frozen host's copy, not the first registration", async () => {
  const { h, capable } = await shared.promise;
  planned(recording());
  // The stranger must register first, so the host's copy is the later one the frozen-host rule has to prefer.
  await ownerGuest(h, false);
  const stranger = await h.root.principalFor((await h.root.actor({ role: "user" })).id);
  await installGuest(h.root, stranger, FOREIGN_DESCRIPTION);
  await installGuest(h.root, h.owner, HOST_DESCRIPTION);
  await h.caller.connection.setBinding({ task: "chat", connectionId: capable });
  const chatId = await startCoreChat(h);
  expect(h.root.app.toolUse.listDrivableToolNames(stranger.userId)).toContain(WIRE_NAME);
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId)).toContain(WIRE_NAME);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId, content: "Use only my tool declaration." })).aborted).toBe(false);
  expect(wires).toHaveLength(1);
  const tools = JSON.stringify(wires[0]?.["tools"]);
  expect(tools).toContain(WIRE_NAME);
  expect(tools).toContain(HOST_DESCRIPTION);
  expect(tools).not.toContain(FOREIGN_DESCRIPTION);
});
