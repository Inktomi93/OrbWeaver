// The `/responses` route sends the SAME implicit prompt-cache controls the chat route sends, on the same gates.
// The SDK writes them as `prompt_cache_key` / `prompt_cache_options` / `prompt_cache_retention`
// (`@ai-sdk/openai` dist `index.js:6425-6427`, option schemas :4361/:4368/:4383), so the two bodies are
// compared key-for-key here instead of restating each gate as an expectation: one shared decision
// (`implicitPromptCacheFields`, `backends/http/response-cache.ts`) is what keeps them from drifting.
// @subject packages/inference/src/backends/openai-compat/responses.ts
// @subject packages/inference/src/backends/http/response-cache.ts
import type { ProviderId } from "@orb/contracts/inference";
import { providerIdSchema, WARNING_CODE } from "@orb/contracts/inference";
import type { ChatHistoryMessage } from "@orb/inference";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest, ResponsesReply } from "@orb/testkit/node/helpers";
import { makeChatId, openAiResponsesServer, openAiServer } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, generationCapability, wireConnection } from "../../roles/runtime.fixtures.ts";

type Connection = Parameters<typeof wireConnection<"chat">>[1];

const SYSTEM_TEXT = "You are a fixture.";
const USER_LINE: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "Hello." }] };
const REPLY: ResponsesReply = { kind: "text", text: "Here you go." };
// The built-in row that speaks BOTH routes of this wire, so one connection shape can be compared across them.
const DEEPSEEK: ProviderId = providerIdSchema.parse("deepseek");

/** The three controls as they sit on a wire body, or `undefined` where the body carries no such key. */
interface PromptCacheControls {
  readonly key: unknown;
  readonly options: unknown;
  readonly retention: unknown;
}

function controlsOf(body: RecordedRequest["body"]): PromptCacheControls {
  return { key: body["prompt_cache_key"], options: body["prompt_cache_options"], retention: body["prompt_cache_retention"] };
}

/** A row whose capability documents the key, the breakpoint format and 24h retention, with the settings asking
 *  for 24h — every gate open, so a missing control on either route is a defect and not a setting. */
function gatedCapability(): ReturnType<typeof generationCapability> {
  return generationCapability({
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: false,
      promptCacheFormat: "openai-breakpoint",
      providerImplicitPromptCache: true,
      promptCacheKey: true,
      promptCacheRetentions: ["in_memory", "24h"],
    },
  });
}

const PROMPT_CACHE = { enabled: true, cacheSystem: false, historyDepth: null, ttl: "1h", retention: "24h" } as const;

async function chatBody(row: Partial<Connection>, chatId: ChatId): Promise<RecordedRequest["body"]> {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { ...row, task: "chat", providerId: row.providerId ?? DEEPSEEK, model: "deepseek-v4-pro" });
  await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "chat-completions",
    connection,
    chatId,
    params: {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: [USER_LINE],
  });
  const [first] = recorded;
  if (first === undefined) {
    throw new Error("the chat turn reached no endpoint");
  }
  return first.body;
}

interface ResponsesSent {
  readonly body: RecordedRequest["body"];
  readonly events: readonly { readonly kind: string; readonly code?: string }[];
}

async function responsesBody(row: Partial<Connection>, chatId: ChatId): Promise<ResponsesSent> {
  const recorded: RecordedRequest[] = [];
  using server = openAiResponsesServer(recorded, () => REPLY);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, {
    ...row,
    task: "chat",
    providerId: row.providerId ?? DEEPSEEK,
    model: "deepseek-v4-pro",
    api: "responses",
  });
  const turn = await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "responses",
    connection,
    chatId,
    params: {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: [USER_LINE],
  });
  const [first] = recorded;
  if (first === undefined) {
    throw new Error("the responses turn reached no endpoint");
  }
  return { body: first.body, events: turn.events };
}

test("every prompt-cache gate open ⇒ the /responses body carries exactly the chat body's three controls", async () => {
  const chatId = makeChatId();
  const row = { capability: gatedCapability(), promptCache: PROMPT_CACHE };
  const responses = await responsesBody(row, chatId);
  const chat = await chatBody(row, chatId);
  // The chat route's own spelling first: this test would pass vacuously if BOTH routes dropped the controls.
  expect(controlsOf(chat)).toEqual({
    key: chatId,
    options: { mode: "implicit", ttl: "30m" },
    retention: "24h",
  });
  expect(controlsOf(responses.body)).toEqual(controlsOf(chat));
});

test("no gate open ⇒ neither route writes a cache control, so the keys appear only when the row earns them", async () => {
  const chatId = makeChatId();
  // A capability with none of the three facts and settings with no retention: nothing is documented, nothing asked.
  const row = { capability: generationCapability(), promptCache: { enabled: true, cacheSystem: false, historyDepth: null, ttl: "1h" } } as const;
  const responses = await responsesBody(row, chatId);
  const chat = await chatBody(row, chatId);
  expect(controlsOf(chat)).toEqual({ key: undefined, options: undefined, retention: undefined });
  expect(controlsOf(responses.body)).toEqual({ key: undefined, options: undefined, retention: undefined });
});

test("a retention the route does not document is dropped with the policy's warning on /responses, as on chat", async () => {
  const chatId = makeChatId();
  // The row documents `24h` only; the settings ask for `in_memory`.
  const row = {
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: false,
        promptCacheRetentions: ["24h"],
      },
    }),
    promptCache: { enabled: true, cacheSystem: false, historyDepth: null, ttl: "1h", retention: "in_memory" },
  } as const;
  const responses = await responsesBody(row, chatId);
  expect(controlsOf(responses.body).retention).toBeUndefined();
  expect(responses.events.some((event) => event.kind === "warning" && event.code === WARNING_CODE.cacheControlAdjusted)).toBe(true);
});
