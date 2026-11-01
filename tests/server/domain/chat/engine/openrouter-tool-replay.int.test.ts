// The reasoning details OpenRouter hangs on a tool call ride back on the leg that answers it and on a later turn's
// history, through the real recurse loop, the variant's stored signatures and the provider's own request conversion.
// @subject packages/inference/src/backends/v4/stream.ts
// @subject packages/inference/src/backends/v4/prompt.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/substrate/wire-history.ts
import { spawn } from "node:child_process";
import { builtinProvider } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createChatRoot, makePluginBundle, SECRET_BOX_TEST_KEY, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { z } from "zod";

const PLUGIN = "openrouter-replay";
const TOOL = pluginToolWireName(PLUGIN, "look");
const DETAIL = { type: "reasoning.encrypted", data: "provider-opaque-reasoning-blob", id: "rs_1", format: "unknown", index: 0 };
const TOOL_CALL = { index: 0, id: "call_replay", type: "function", function: { name: TOOL, arguments: "{}" } };

function sse(...lines: readonly string[]): Response {
  return new Response(`${lines.join("\n\n")}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

function delta(fields: object): string {
  return `data: ${JSON.stringify({ id: "gen-replay", choices: [{ index: 0, delta: fields, ["finish_reason"]: null }] })}`;
}

const assistantRowSchema = z.object({
  role: z.string(),
  ["tool_calls"]: z.array(z.object({ id: z.string() })).optional(),
  ["reasoning_details"]: z.json().optional(),
});
const bodySchema = z.object({ messages: z.array(assistantRowSchema.loose()) });

test("a tool call's reasoning details return on the answering leg and from the stored turn", async () => {
  const hostedUrl = `${(builtinProvider("openrouter")?.baseUrl ?? "").replace(/\/$/u, "")}/chat/completions`;
  const bodies: z.infer<typeof bodySchema>[] = [];
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: {
      secretBoxKey: SECRET_BOX_TEST_KEY,
      pluginSpawn: spawn,
      networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) },
    },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.url !== hostedUrl) {
        throw new Error(`unscripted provider URL: ${request.url}`);
      }
      bodies.push(bodySchema.parse(await request.json()));
      return bodies.length === 1
        ? sse(
            delta({ role: "assistant", ["reasoning_details"]: [DETAIL] }),
            delta({ ["tool_calls"]: [TOOL_CALL] }),
            terminalSseLine({ finishReason: "tool_calls", delta: {} }),
          )
        : sse(delta({ role: "assistant", content: "Answered." }), terminalSseLine({ finishReason: "stop", delta: {} }));
    },
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "openrouter", key: "controlled-replay-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "openrouter",
    credentialId: credential.id,
    baseUrl: null,
    model: "controlled-replay-model",
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true }, reasoning: { replay: "signed" } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const manifest = pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Replay witness",
    description: "A tool whose exchange replays into later history.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["tools.register"],
  });
  const source = `const host = orb.host(1);
host.tools.register({name:"look",description:"Look.",replayHistory:true,
  parameters:{type:"object",properties:{},additionalProperties:false},handler:async()=>"Seen"});`;
  const installed = await seedInstalledPlugin(h.root, { caller: h.owner, bundle: makePluginBundle(manifest, source, h.root.clock.now()), grant: [] });
  const enabled = await seedPluginGrant(h.root, {
    caller: h.owner,
    pluginId: installed.outcome.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");

  const params = { principal: h.owner, chatId: h.chatId };
  expect((await h.root.services.chat.generate(params)).aborted).toBe(false);
  expect((await h.root.services.chat.send({ ...params, content: "And now?" })).aborted).toBe(false);

  expect(bodies).toHaveLength(3);
  const carried = (body: z.infer<typeof bodySchema> | undefined): unknown =>
    body?.messages.find((row) => row.tool_calls?.[0]?.id === TOOL_CALL.id)?.reasoning_details;
  expect(carried(bodies[1])).toEqual([expect.objectContaining({ type: DETAIL.type, data: DETAIL.data })]);
  expect(carried(bodies[2])).toEqual([expect.objectContaining({ type: DETAIL.type, data: DETAIL.data })]);
});
