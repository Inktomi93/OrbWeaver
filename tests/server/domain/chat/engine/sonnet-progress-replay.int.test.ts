// The real chat engine must return each signed progress block to the next tool leg with its originating tool call.
// @subject packages/inference/src/funnel/resolve-chat.ts
// @subject packages/inference/src/backends/anthropic-messages/chat.ts
import { spawn } from "node:child_process";
import { builtinProvider, modelIdSchema, WARNING_CODE } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import type { UserIntent } from "@orb/contracts/preset";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusViewerReadResponder, nonEmpty, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  loadCorpusFixture,
  makePluginBundle,
  SECRET_BOX_TEST_KEY,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { anthropicTextReply, messageEnd, messageStart, thinkingBlock, toolUseBlock } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { SETTINGS_ADJUSTED_CODE } from "#contracts/chat/bus.ts";

const MODEL = modelIdSchema.parse("claude-sonnet-5-5");
const PLUGIN = "sonnet-progress";
const TOOL = pluginToolWireName(PLUGIN, "inspect");
const UPDATES_BETA = "thinking-display-updates-2026-08-18";
type Snapshot = NonNullable<CorpusPlayback["chatLifecycleMember"]>["heldDuring"];

function capturedMessages(snapshot: Snapshot): Snapshot["read"]["output"]["messages"] {
  return createCorpusViewerReadResponder("chat.listMessages", snapshot.viewerUserId, snapshot)(snapshot.read.input).messages;
}

function corpusExchange(): {
  readonly answer: string;
  readonly notes: readonly {
    readonly callId: string;
    readonly text: string;
    readonly signature: MessageVariantId;
    readonly input: { readonly messageId: MessageId; readonly seq: number };
  }[];
} {
  const lifecycle = loadCorpusFixture().wire.chatLifecycleMember;
  if (lifecycle === undefined) {
    throw new Error("The published corpus needs its chat lifecycle captures.");
  }
  const first = capturedMessages(lifecycle.heldDuring)[0];
  const second = capturedMessages(lifecycle.abortedDuring)[0];
  const answer = capturedMessages(lifecycle.heldCompleted).find((row) => row.role === "assistant");
  if (first === undefined || second === undefined || answer === undefined) {
    throw new Error("The published lifecycle capture needs both user requests and the completed assistant reply.");
  }
  return {
    answer: answer.content,
    // These captures have no Anthropic signatures. Their distinct variant IDs exercise opaque transport unchanged.
    notes: [first, second].map((row) => ({
      callId: `toolu_${row.id}`,
      text: row.content,
      signature: row.selectedVariantId,
      input: { messageId: row.id, seq: row.seq },
    })),
  };
}
const contentBlock = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    thinking: z.string().optional(),
    text: z.string().optional(),
    signature: z.string().optional(),
    ["tool_use_id"]: z.string().optional(),
    ["is_error"]: z.boolean().optional(),
  })
  .loose();
const messageBody = z.object({
  model: z.string(),
  system: z.union([z.string(), z.array(contentBlock)]).optional(),
  thinking: z.object({ type: z.string(), display: z.string().optional() }).loose(),
  tools: z.array(z.object({ name: z.string() })),
  messages: z.array(
    z.object({
      role: z.string(),
      ["output_config"]: z.object({ effort: z.string().optional() }).optional(),
      content: z.union([z.string(), z.array(contentBlock)]),
    }),
  ),
});
const cases = [
  { name: "explicit tool-chain", model: MODEL, intent: { effort: "none", carryReasoning: "tool-chain" }, carries: true, display: null, warning: null },
  { name: "default carry off", model: MODEL, intent: { effort: "none" }, carries: false, display: null, warning: null },
  {
    name: "conversation limited to current chain",
    model: MODEL,
    intent: { effort: "none", carryReasoning: "conversation" },
    carries: true,
    display: null,
    warning: WARNING_CODE.carryReasoningDowngraded,
  },
  {
    name: "adaptive progress updates",
    model: MODEL,
    intent: { effort: "low", thinkingDisplay: "updates", carryReasoning: "tool-chain" },
    carries: true,
    display: "updates",
    warning: null,
  },
  {
    name: "unsupported progress display",
    model: modelIdSchema.parse("claude-sonnet-5"),
    intent: { effort: "low", thinkingDisplay: "updates", carryReasoning: "tool-chain" },
    carries: true,
    display: "summarized",
    warning: WARNING_CODE.displayDropped,
  },
] as const satisfies readonly { name: string; model: typeof MODEL; intent: UserIntent; carries: boolean; display: string | null; warning: string | null }[];

// A tool continuation adds protocol blocks; the assembled system and ordinary message text stay in order.
function promptText(body: z.infer<typeof messageBody>): readonly string[] {
  const text = (content: string | z.infer<typeof contentBlock>[]): string[] =>
    typeof content === "string" ? [content] : content.flatMap((block) => (block.type === "text" && block.text !== undefined ? [block.text] : []));
  return [...text(body.system ?? []), ...body.messages.flatMap((message) => text(message.content))];
}

function expectToolHistory(body: z.infer<typeof messageBody>, depth: number, notes: ReturnType<typeof corpusExchange>["notes"], carries: boolean): void {
  const exchanges = body.messages.flatMap((row) =>
    row.role === "assistant" && Array.isArray(row.content) && row.content.some((block) => block.type === "tool_use") ? [row.content] : [],
  );
  expect(exchanges).toHaveLength(depth);
  for (const [at, blocks] of exchanges.entries()) {
    const note = notes[at];
    if (note === undefined) {
      throw new Error("unexpected replayed tool leg");
    }
    expect(blocks.filter((block) => block.type === "thinking")).toEqual(carries ? [{ type: "thinking", thinking: note.text, signature: note.signature }] : []);
    expect(blocks[carries ? 1 : 0]).toMatchObject({ type: "tool_use", id: note.callId, name: TOOL, input: note.input });
  }
}

test.for(cases)("Anthropic preserves the physical tool exchange with $name", async ({ model, intent, carries, display, warning }) => {
  const { answer, notes } = corpusExchange();
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  const bodies: z.infer<typeof messageBody>[] = [];
  const betas: string[] = [];
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [model],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: answer,
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages(payload, headers) {
      const parsed = messageBody.parse(JSON.parse(payload));
      expect(parsed.model).toBe(model);
      bodies.push(parsed);
      betas.push(headers.get("anthropic-beta") ?? "");
      expect(parsed.tools.map((tool) => tool.name)).toContain(TOOL);
      const completed = parsed.messages.flatMap((row) => (Array.isArray(row.content) ? row.content.filter((part) => part.type === "tool_result") : []));
      expect(completed.map((block) => ({ callId: block.tool_use_id, failed: block.is_error === true }))).toEqual(
        notes.slice(0, bodies.length - 1).map((step) => ({ callId: step.callId, failed: false })),
      );
      const note = notes[completed.length];
      if (note === undefined) {
        return anthropicTextReply(model, answer);
      }
      return [
        messageStart(model),
        ...thinkingBlock(0, note.text, note.signature),
        ...toolUseBlock(1, { id: note.callId, name: TOOL, inputJson: JSON.stringify(note.input) }),
        ...messageEnd({ stopReason: "tool_use" }),
      ];
    },
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, pluginSpawn: spawn, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: provider.execute,
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-corpus-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const manifest = pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Corpus inspection",
    description: "Inspect one ledger entry.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["tools.register"],
  });
  const source =
    'orb.host(1).tools.register({name:"inspect",description:"Inspect the ledger.",parameters:{type:"object",properties:{messageId:{type:"string"},seq:{type:"integer"}},required:["messageId","seq"],additionalProperties:false},handler:args=>args.messageId});';
  const installed = await seedInstalledPlugin(h.root, { caller: h.owner, bundle: makePluginBundle(manifest, source, h.root.clock.now()), grant: [] });
  const enabled = await seedPluginGrant(h.root, {
    caller: h.owner,
    pluginId: installed.outcome.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const result = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent });
  expect(result.aborted).toBe(false);
  const events = await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId });
  const adjustments = new Set(
    events.flatMap(({ event }) =>
      event.type === "warning" &&
      event.code === SETTINGS_ADJUSTED_CODE &&
      (event.adjustment === WARNING_CODE.displayDropped || event.adjustment === WARNING_CODE.carryReasoningDowngraded)
        ? [event.adjustment]
        : [],
    ),
  );
  expect([...adjustments]).toEqual(warning === null ? [] : [warning]);
  expect(bodies).toHaveLength(notes.length + 1);
  const [opening] = bodies;
  if (opening === undefined) {
    throw new Error("No physical Messages request captured");
  }
  const initialText = promptText(opening);
  for (const [depth, body] of bodies.entries()) {
    expect(promptText(body)).toEqual(initialText);
    expect(nonEmpty(body.messages).every((message) => message.output_config?.effort === undefined)).toBe(true);
    const adaptive = expect.objectContaining({ type: "adaptive", display });
    expect(body.thinking).toEqual(display === null ? { type: "between_tools" } : adaptive);
    expect(betas[depth]?.split(",").includes(UPDATES_BETA)).toBe(display === "updates");
    expectToolHistory(body, depth, notes, carries);
  }
});
