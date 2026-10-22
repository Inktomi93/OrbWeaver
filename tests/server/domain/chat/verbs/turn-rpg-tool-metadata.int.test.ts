// @subject packages/server/src/infra/plugin-host/sandbox.ts
// @subject packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { messageVariants } from "@orb/db";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreSse } from "../engine/core-physical.ts";
import { turnToolsRoom, turnWireBody } from "./turn-rpg-physical.ts";

const MANIFEST = pluginManifestSchema.parse({
  id: "tool-metadata",
  name: "Native tool metadata witness",
  description: "Executes three actual guest tool declaration policies.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["tools.register"],
});
const DECLARATIONS = [
  { name: "retained_state", description: "Read retained state.", displayName: "Retained State", replayHistory: true },
  { name: "ephemeral_signal", description: "Read an ephemeral signal.", displayName: "Ephemeral Signal", replayHistory: false },
  { name: "default_report", description: "Read the default report." },
] as const;
const GUEST = `const host = orb.host(1);\n${DECLARATIONS.map((tool) => `host.tools.register({ ...${JSON.stringify({ ...tool, parameters: { type: "object", properties: {}, additionalProperties: false } })}, handler: async () => ${JSON.stringify(`${tool.name} ran`)} });`).join("\n")}`;

test("a native installed guest preserves supplied display and true or false replay metadata through actual execution and persistence", async () => {
  const wires: string[] = [];
  await using h = await turnToolsRoom(
    [
      async (request): Promise<Response> => {
        const body = await turnWireBody(request);
        wires.push(JSON.stringify(body));
        for (const tool of DECLARATIONS) {
          expect(JSON.stringify(body["tools"])).toContain(pluginToolWireName(MANIFEST.id, tool.name));
        }
        return coreSse([
          coreFrame({
            choices: [
              {
                delta: {
                  ["tool_calls"]: DECLARATIONS.map((tool, index) => ({
                    index,
                    id: `native-metadata-${index}`,
                    type: "function",
                    function: { name: pluginToolWireName(MANIFEST.id, tool.name), arguments: "{}" },
                  })),
                },
              },
            ],
          }),
          terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
        ]);
      },
      async (request): Promise<Response> => {
        wires.push(JSON.stringify(await turnWireBody(request)));
        return coreSse([
          coreFrame({ choices: [{ delta: { content: "All three native guest handlers returned." } }] }),
          terminalSseLine({ usage: { promptTokens: 16, completionTokens: 8 } }),
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
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Execute each of the three offered reports." });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the native tool execution did not select an assistant variant");
  }
  expect(assistant.content).toBe("All three native guest handlers returned.");
  expect(assistant.toolCalls).toHaveLength(3);
  expect(assistant.toolCalls.map(({ name, result, isError }) => ({ name, result, isError }))).toEqual(
    DECLARATIONS.map((tool) => ({ name: pluginToolWireName(MANIFEST.id, tool.name), result: `${tool.name} ran`, isError: false })),
  );
  expect(assistant.toolCalls).toMatchObject([
    {
      name: pluginToolWireName(MANIFEST.id, "retained_state"),
      result: "retained_state ran",
      isError: false,
      displayName: "Retained State",
      replayHistory: true,
    },
    {
      name: pluginToolWireName(MANIFEST.id, "ephemeral_signal"),
      result: "ephemeral_signal ran",
      isError: false,
      displayName: "Ephemeral Signal",
      replayHistory: false,
    },
    { name: pluginToolWireName(MANIFEST.id, "default_report"), result: "default_report ran", isError: false, displayName: "default report" },
  ]);
  expect(assistant.toolCalls[2]).not.toHaveProperty("replayHistory");
  expect(
    await h.root.db.select({ toolCalls: messageVariants.toolCalls }).from(messageVariants).where(eq(messageVariants.id, assistant.selectedVariantId)),
  ).toEqual([{ toolCalls: assistant.toolCalls }]);
  expect(wires).toHaveLength(2);
  for (const tool of DECLARATIONS) {
    expect(wires[1]).toContain(`${tool.name} ran`);
  }
});
