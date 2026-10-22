// @subject packages/server/src/domain/tool-use/teaching-contribution.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { coreFrame, coreHttpRoom, coreSse } from "../engine/core-physical.ts";
import { turnToolsRoom, turnWireBody } from "./turn-rpg-physical.ts";

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
    pluginId: installed.plugin.id,
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

const ABSENCE_ROWS = [
  { label: "an installed contributor on a tools-incapable saved model", installed: true, capable: false },
  { label: "a tools-capable saved model with no contributor", installed: false, capable: true },
] as const;

test.for(ABSENCE_ROWS)("public SEND omits tools for $label", async (row) => {
  const wires: Awaited<ReturnType<typeof turnWireBody>>[] = [];
  const build = row.capable ? turnToolsRoom : coreHttpRoom;
  await using h = await build(
    [
      async (request): Promise<Response> => {
        wires.push(await turnWireBody(request));
        return prose();
      },
    ],
    { server: { pluginSpawn: spawn } },
  );
  if (row.installed) {
    await installGuest(h.root, h.owner, HOST_DESCRIPTION);
  }
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId).includes(WIRE_NAME)).toBe(row.installed);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Reply without an attachable tool." });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([
    { content: "The keeper finishes the offered turn.", toolCalls: [] },
  ]);
  expect(wires).toHaveLength(1);
  expect(wires[0]?.["tools"]).toBeUndefined();
});

test("native plugin deactivation removes its tool from the next actual SEND rather than leaving a stale attach list", async () => {
  const wires: Awaited<ReturnType<typeof turnWireBody>>[] = [];
  const reply = async (request: Request): Promise<Response> => {
    wires.push(await turnWireBody(request));
    return prose();
  };
  await using h = await turnToolsRoom([reply, reply], { server: { pluginSpawn: spawn } });
  const enabled = await installGuest(h.root, h.owner, HOST_DESCRIPTION);
  const params = { principal: h.owner, chatId: h.chatId, content: "Describe this beat." };
  expect((await h.root.services.chat.send(params)).aborted).toBe(false);
  expect(JSON.stringify(wires[0]?.["tools"])).toContain(WIRE_NAME);
  await h.root.services.plugin.setEnabled({ caller: h.owner, pluginId: enabled.plugin.id, enabled: false });
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId)).not.toContain(WIRE_NAME);
  expect((await h.root.services.chat.send(params)).aborted).toBe(false);
  expect(wires).toHaveLength(2);
  expect(wires[1]?.["tools"]).toBeUndefined();
});

test("two real installers with the same namespaced tool attach the frozen host's copy, not the first registration", async () => {
  const wires: Awaited<ReturnType<typeof turnWireBody>>[] = [];
  await using h = await turnToolsRoom(
    [
      async (request): Promise<Response> => {
        wires.push(await turnWireBody(request));
        return prose();
      },
    ],
    { server: { pluginSpawn: spawn } },
  );
  const stranger = await h.root.principalFor((await h.root.actor({ role: "user" })).id);
  await installGuest(h.root, stranger, FOREIGN_DESCRIPTION);
  await installGuest(h.root, h.owner, HOST_DESCRIPTION);
  expect(h.root.app.toolUse.listDrivableToolNames(stranger.userId)).toContain(WIRE_NAME);
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId)).toContain(WIRE_NAME);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Use only my tool declaration." })).aborted).toBe(false);
  expect(wires).toHaveLength(1);
  const tools = JSON.stringify(wires[0]?.["tools"]);
  expect(tools).toContain(WIRE_NAME);
  expect(tools).toContain(HOST_DESCRIPTION);
  expect(tools).not.toContain(FOREIGN_DESCRIPTION);
});
