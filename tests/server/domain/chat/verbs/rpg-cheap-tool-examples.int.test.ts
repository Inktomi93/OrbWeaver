// @subject packages/server/src/domain/rpg/tools/rounds/tool-round.ts
// @subject packages/inference/src/backends/anthropic-messages/model.ts
import { builtinProvider, declaredCapabilitySchema, modelIdSchema, providerDefSchema } from "@orb/contracts/inference";
import { resolveProseText } from "@orb/contracts/prose";
import type { ChatId } from "@orb/kit/ids";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import { anthropicSse, messageEnd, messageStart, textBlock, toolUseBlock } from "@orb/testkit/node/helpers";
import { z } from "zod";

const INPUT_EXAMPLES = "input_examples";
const requestSchema = z.object({
  model: z.string(),
  tools: z.array(z.object({ name: z.string(), [INPUT_EXAMPLES]: z.array(z.record(z.string(), z.unknown())).optional() }).loose()).optional(),
  messages: z.array(z.object({ content: z.unknown() })),
});
const sceneTool = "update_scene";

interface RecordedScene {
  readonly chatId: ChatId;
  readonly text: string;
  readonly args: string;
}

async function recordedScene(root: Awaited<ReturnType<typeof createCorpusHarness>>): Promise<RecordedScene> {
  const caller = await root.internalCallerFor(root.ownerId);
  const rooms = root.corpus.wire.reads["chat.listChats"][0]?.output.items ?? [];
  for (const room of rooms.filter((row) => row.isGame && row.viewerRole === "host").toSorted((a, b) => a.id.localeCompare(b.id))) {
    const scope = { chatId: room.id };
    if ((await caller.rpg.getGame(scope)).status !== "active") {
      continue;
    }
    const turns = await caller.rpg.listTurnToolCalls(scope);
    const { messages } = await caller.chat.listMessages(scope);
    for (const turn of turns) {
      const scene = turn.calls.find((entry) => entry.name === sceneTool && entry.withheld === null);
      const message = messages.find((row) => row.role === "assistant" && row.id === turn.messageId && row.selectedVariantId === turn.variantId);
      const text = message?.content;
      if (scene !== undefined && text !== undefined && text.length > 0) {
        return { chatId: room.id, text, args: scene.args };
      }
    }
  }
  throw new Error("The corpus must contain a host-readable narrated RPG scene update.");
}

test("only a direct Anthropic cheap round sends the state tool examples and requests their beta", { tags: "slow" }, async () => {
  const captured: { endpoint: string; beta: string; body: z.infer<typeof requestSchema> }[] = [];
  let replay: RecordedScene | undefined;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: () => {
      if (replay === undefined) {
        throw new Error("The corpus narration is unavailable");
      }
      return replay.text;
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const allowedAnthropicOrigins = new Set<string>();
  const corpusOrigin = new URL(CORPUS_PROVIDER_ENDPOINT).origin;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === corpusOrigin) {
      return corpus.execute(request);
    }
    if (replay === undefined || !allowedAnthropicOrigins.has(url.origin) || request.method !== "POST" || url.pathname !== "/v1/messages") {
      throw new Error(`Unexpected corpus provider request: ${request.method} ${request.url}`);
    }
    const body = requestSchema.parse(await request.json());
    captured.push({ endpoint: new URL(request.url).origin, beta: request.headers.get("anthropic-beta") ?? "", body });
    const calls = body.tools?.some((tool) => tool.name === sceneTool) === true;
    return anthropicSse([
      messageStart(body.model),
      ...textBlock(0, replay.text),
      ...(calls ? toolUseBlock(1, { id: `corpus-state-call-${captured.length}`, name: sceneTool, inputJson: replay.args }) : []),
      ...messageEnd({ stopReason: calls ? "tool_use" : "end_turn" }),
    ]);
  };
  await using root = await createCorpusHarness(undefined, {
    providerFetch,
    secretBoxKey: SECRET_BOX_TEST_KEY,
    networkExecution: {
      fetch: providerFetch,
      resolver: (hostname) =>
        [...allowedAnthropicOrigins].some((origin) => new URL(origin).hostname === hostname)
          ? Promise.resolve([PUBLIC_PEER_ADDRESS])
          : Promise.reject(new Error(`Unscripted state-round hostname: ${hostname}`)),
    },
  });
  const sample = await recordedScene(root);
  replay = sample;
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const direct = builtinProvider("anthropic");
  if (direct?.baseUrl === undefined) {
    throw new Error("The built-in Anthropic provider must declare an origin.");
  }
  const relay = providerDefSchema.parse({ ...direct, id: "corpus-anthropic-relay", baseUrl: "https://corpus-relay.invalid" });
  await root.app.runtime.providers.registry.register(relay, { admin: root.ownerId });
  const configuration: Parameters<typeof caller.rpg.updateConfig>[0] = {
    chatId: sample.chatId,
    extractionMode: "cheap",
    patch: { stateCaptureVehicle: "tools" },
  };
  await caller.rpg.updateConfig(configuration);
  expect(await caller.rpg.getConfigView({ chatId: sample.chatId })).toMatchObject({ extractionMode: "cheap", stateCaptureVehicle: "tools" });
  const cue = resolveProseText("rpg.extract.toolRoundUserLine", {});
  for (const provider of [direct, relay]) {
    if (provider.baseUrl === undefined) {
      throw new Error("Missing corpus provider endpoint");
    }
    allowedAnthropicOrigins.add(new URL(provider.baseUrl).origin);
    const credential = await root.services.credentials.add({ principal, provider: provider.id, key: "corpus-tool-examples" });
    const connection = await root.services.connection.create({
      principal,
      providerId: provider.id,
      credentialId: credential.id,
      baseUrl: null,
      allowBackground: true,
      model: modelIdSchema.parse("claude-sonnet-4-5"),
      declared: declaredCapabilitySchema.parse({
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, requiredChoice: false, silencesProse: false } },
      }),
    });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    const before = captured.length;
    const result = await root.services.chat.send({
      principal,
      chatId: sample.chatId,
      content: sample.text,
      intent: { maxContextTokens: 32_000, maxOutputTokens: 256 },
    });
    expect(result.aborted).toBe(false);
    await root.settleBackground();
    const sent = captured.slice(before);
    const state = sent.find((request) => request.body.tools?.some((tool) => tool.name === sceneTool));
    if (state === undefined) {
      const trace = root.observability
        .logLines(80)
        .filter((line) => line.includes("rpg"))
        .slice(0, 5);
      throw new Error(`No cheap RPG request from ${provider.id} (${sent.length} provider calls): ${trace.join("\n")}`);
    }
    expect(state.endpoint).toBe(provider.baseUrl);
    expect(JSON.stringify(sent[0]?.body.messages)).not.toContain(cue);
    expect(JSON.stringify(state.body.messages)).toContain(cue);
    const examples = state.body.tools?.find((tool) => tool.name === sceneTool)?.[INPUT_EXAMPLES];
    expect(examples !== undefined && examples.length > 0).toBe(provider.id === direct.id);
    expect(state.beta.includes("advanced-tool-use-2025-11-20")).toBe(provider.id === direct.id);
  }
});
