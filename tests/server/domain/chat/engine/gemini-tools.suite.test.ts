import type { ContentSignatures } from "@orb/contracts/chat";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { createInferenceRuntime } from "@orb/inference";
import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PortableChat } from "@orb/server/kit/serde/chat-bundle";
import { buildChatBundleFile, parseChatBundleFile } from "@orb/server/kit/serde/chat-bundle";
import { z } from "zod";
import { buildWirePlan } from "../../../../../packages/inference/src/backends/v4/prompt.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { buildCommittedMessageView } from "../../../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { continuedSignatureMetadata, signaturesForContent } from "../../../../../packages/server/src/domain/chat/substrate/content-signatures.ts";
import { projectViewForMember } from "../../../../../packages/server/src/domain/chat/substrate/member-visibility.ts";
import { buildWireHistory } from "../../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { EXPECTED_VALUES, ordinaryTurn, registryFor, TOOL_NAMES } from "../../../../../scripts/probes/gemini-capabilities/scenario.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved, newUserId } from "../../../../inference/_support.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testProviderId } from "../../../../support/inference-identities.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";

const GOOGLE_DETAIL = { type: "reasoning.encrypted", data: "fixture-google-opaque-proof", id: "call-alpha", format: "google-gemini-v1", index: 0 };
const record = z.record(z.string(), z.unknown());

test.each([false, true])("ordinary OpenRouter Gemini tools preserve required opaque metadata with carry disabled, late detail: %s", async (late) => {
  const owner = principal(newUserId());
  const model = "google/gemini-3.8-flash";
  const bodies: Record<string, unknown>[] = [];
  const runtime = await createInferenceRuntime(
    fakeDeps({
      fetch: (_url, init) => {
        bodies.push(record.parse(JSON.parse(String(init?.body))));
        const delta =
          bodies.length === 1
            ? {
                ...(late ? {} : { ["reasoning_details"]: [GOOGLE_DETAIL] }),
                ["tool_calls"]: [
                  { index: 0, id: "call-alpha", type: "function", function: { name: "lookup_alpha", arguments: '{"key":"value"}' } },
                  { index: 1, id: "call-beta", type: "function", function: { name: "lookup_beta", arguments: '{"key":"value"}' } },
                ],
              }
            : { content: bodies.length === 2 ? EXPECTED_VALUES.join(" ") : '{"ok":true}' };
        const chunk = {
          id: "fixture",
          choices: [{ index: 0, delta, ["finish_reason"]: bodies.length === 1 ? "tool_calls" : "stop" }],
          usage: { ["prompt_tokens"]: 30, ["completion_tokens"]: 10, ["total_tokens"]: 40 },
        };
        const lateChunk =
          late && bodies.length === 1
            ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { ["reasoning_details"]: [GOOGLE_DETAIL] }, ["finish_reason"]: "tool_calls" }] })}\n\n`
            : "";
        return Promise.resolve(
          new Response(`data: ${JSON.stringify(chunk)}\n\n${lateChunk}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }),
        );
      },
    }),
  );
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model, providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model,
    ownerId: owner.userId,
    capability,
    secret: fakeApiKeySecret("fixture-key"),
  });
  try {
    const result = await ordinaryTurn({ connection, owner, runChatTurn: runtime.executor.runChatTurn });
    expect(result.content).toContain(EXPECTED_VALUES[0]);
    expect(result.content).toContain(EXPECTED_VALUES[1]);
    expect(result.toolRecords.map((r) => [r.toolCallId, r.name, r.isError])).toEqual([
      ["call-alpha", "lookup_alpha", false],
      ["call-beta", "lookup_beta", false],
    ]);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(
        z
          .array(record)
          .parse(body["tools"])
          .map((tool) => record.parse(tool["function"])["name"]),
      ).toEqual(TOOL_NAMES);
    }
    const messages = z.array(record).parse(bodies[1]?.["messages"]);
    const assistant = messages.find((m) => m["role"] === "assistant");
    expect(assistant?.["reasoning_details"]).toEqual([GOOGLE_DETAIL]);
    expect(messages.filter((m) => m["role"] === "tool").map((m) => m["tool_call_id"])).toEqual(["call-alpha", "call-beta"]);
    expect(result.toolSignatures).toHaveLength(1);
    expect(result.toolSignatures[0]?.openrouter?.reasoningDetails).toEqual([GOOGLE_DETAIL]);
    expect(result.toolRecords[0]).not.toHaveProperty("openrouter");
    const metadata = parseVariantMetadata(
      JSON.parse(JSON.stringify({ contentSignatures: { content: result.content, text: [], images: [], tools: result.toolSignatures } })),
    );
    const view = buildCommittedMessageView({
      messageId: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      chatId: mintTypeId(ID_PREFIX.chat),
      seq: 0,
      role: "assistant",
      now: 0,
      variant: { content: result.content, metadata, toolCalls: result.toolRecords },
    });
    const member = projectViewForMember(view, false);
    expect(JSON.stringify(member)).not.toContain(GOOGLE_DETAIL.data);
    expect(member).not.toHaveProperty("metadata");
    const signatures = signaturesForContent(metadata.contentSignatures, view.content);
    const replay = await buildWireHistory(
      {
        toolsOk: true,
        carryToolReasoning: false,
        visionOk: false,
        videoOk: false,
        cardKeepLastX: undefined,
        canon: [view],
        reasoningByMessage: new Map<MessageId, never>(),
        contentSignaturesByMessage: signatures === undefined ? new Map<MessageId, ContentSignatures>() : new Map([[view.id, signatures]]),
        resolveImageUrl: () => Promise.resolve(null),
        loadInlineReplyAssetIds: () => Promise.resolve(new Map()),
      },
      [{ role: "assistant", content: view.content, messageId: view.id }],
    );
    const history = replay.flatMap((item) => [...(item.prefixRows ?? []), item.row]);
    const calls = history.flatMap((item) => item.content).filter((part) => part.type === "tool-call");
    expect(calls.map((call) => [call.toolCallId, call.openrouter?.reasoningDetails])).toEqual([
      ["call-alpha", [GOOGLE_DETAIL]],
      ["call-beta", undefined],
    ]);
    const planned = buildWirePlan({ systemPrompt: { static: "", dynamic: "" }, history });
    const assistantFrame = planned.prompt.find((item) => item.role === "assistant");
    expect(
      assistantFrame?.role === "assistant"
        ? assistantFrame.content.find((part) => part.type === "tool-call")?.providerOptions?.["openrouter"]?.["reasoning_details"]
        : null,
    ).toEqual([GOOGLE_DETAIL]);
    const continued = continuedSignatureMetadata({
      beforeContent: view.content,
      additionContent: ".",
      before: metadata,
      addition: null,
      beforeTools: result.toolRecords,
    });
    expect(signaturesForContent(continued?.contentSignatures, view.content)?.tools?.[0]?.openrouter?.reasoningDetails).toEqual([GOOGLE_DETAIL]);
    expect(signaturesForContent(continued?.contentSignatures, `${view.content}.`)?.tools?.[0]?.openrouter?.reasoningDetails).toEqual([GOOGLE_DETAIL]);
    expect(signaturesForContent(continued?.contentSignatures, "edited")).toBeUndefined();
    const portable = {
      title: "Opaque replay",
      createdAt: 0,
      updatedAt: 0,
      starred: false,
      archived: false,
      compactSummary: null,
      compactedAtSeq: null,
      metadata: null,
      variableValues: null,
      userMacroValues: null,
      anchorPersonaName: null,
      characterHandles: [],
      tagNames: [],
      injections: [],
      rpg: null,
      messages: [
        {
          role: "assistant",
          kind: "standard",
          speakerHandle: null,
          personaName: null,
          createdAt: 0,
          selectedIdx: 0,
          variants: [
            {
              idx: 0,
              content: view.content,
              model: null,
              provider: "openrouter",
              tokensIn: null,
              tokensOut: null,
              tokenProvenance: "unrecorded",
              reasoning: null,
              ttftMs: null,
              genStartedAt: null,
              genFinishedAt: null,
              variableDelta: null,
              metadata: continued,
            },
          ],
        },
      ],
    } satisfies PortableChat;
    const bytes = buildChatBundleFile(portable);
    const imported = parseChatBundleFile(bytes);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      throw new Error("Native chat bundle was refused");
    }
    const restored = parseVariantMetadata(imported.value.messages[0]?.variants[0]?.metadata);
    expect(restored.contentSignatures?.tools?.[0]?.openrouter?.reasoningDetails).toEqual([GOOGLE_DETAIL]);
    expect(restored.contentSignatures?.previous?.tools?.[0]?.openrouter?.reasoningDetails).toEqual([GOOGLE_DETAIL]);
    expect(buildChatBundleFile(imported.value)).toEqual(bytes);
    const strict = await runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      params: { effort: "low" },
      systemPrompt: { static: "Return a result.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Return ok true." }] }],
      tools: registryFor(owner).definitions.map((tool) => ({ ...tool, strict: true })),
      toolChoice: { mode: "auto" },
      responseFormat: { name: "result", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) },
    });
    expect(strict.reply).toBe('{"ok":true}');
    expect(strict.events.filter((event) => event.kind === "warning").map((event) => event.code)).toEqual(["sdk_unsupported_tool", "sdk_unsupported_tool"]);
    const strictBody = bodies[2];
    expect(record.parse(record.parse(strictBody?.["response_format"])["json_schema"])["strict"]).toBe(true);
    expect(
      z
        .array(record)
        .parse(strictBody?.["tools"])
        .every((tool) => !("strict" in record.parse(tool["function"]))),
    ).toBe(true);
  } finally {
    await runtime.localLight.close();
  }
});
