// @subject packages/server/src/domain/tool-use/teaching-contribution.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreSse } from "../engine/core-physical.ts";
import { turnToolsRoom, turnWireBody } from "./turn-rpg-physical.ts";

const MANIFEST = pluginManifestSchema.parse({
  id: "turn-teaching",
  name: "Turn teaching witness",
  description: "A finite native guest whose tool declaration reaches the actual turn.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["tools.register"],
});
const LOCAL_TOOL = "report_mood";
const TOOL_DESCRIPTION = "Report the installed host's scene mood.";
const GUEST = `const host = orb.host(1);
host.tools.register({ name: ${JSON.stringify(LOCAL_TOOL)}, description: ${JSON.stringify(TOOL_DESCRIPTION)},
  parameters: { type: "object", properties: {}, additionalProperties: false }, handler: async () => "calm" });`;

test("a genuinely installed and granted native teaching tool reaches public SEND's provider declaration", async () => {
  const wires: string[] = [];
  await using h = await turnToolsRoom(
    [
      async (request): Promise<Response> => {
        const body = await turnWireBody(request);
        wires.push(JSON.stringify(body["tools"]));
        return coreSse([
          coreFrame({ choices: [{ delta: { content: "The keeper answers without invoking the offered tool." } }] }),
          terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
        ]);
      },
    ],
    { server: { pluginSpawn: spawn } },
  );
  const installed = await seedInstalledPlugin(h.root, {
    caller: h.owner,
    bundle: makePluginBundle(MANIFEST, GUEST, h.root.clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrant(h.root, {
    caller: h.owner,
    pluginId: installed.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const tool = pluginToolWireName(MANIFEST.id, LOCAL_TOOL);
  expect(h.root.app.toolUse.listDrivableToolNames(h.owner.userId)).toContain(tool);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Describe the keeper's mood." });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([
    { role: "assistant", content: "The keeper answers without invoking the offered tool.", toolCalls: [] },
  ]);
  expect(wires).toHaveLength(1);
  expect(wires[0]).toContain(tool);
  expect(wires[0]).toContain(TOOL_DESCRIPTION);
});
