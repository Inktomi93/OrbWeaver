// Agent-sdk summarize role: the Max sub (mode-1) as a selectable, schema-validated summarizer. A request
// shaper over a stateless utility turn (tool-less, maxTurns:2, no session resume) — each item is an
// independent spawn, reduced by a linear init→assistant→result read. Mode-1 only; a non-sub credential
// fails closed toward the hosted (OpenRouter) summarize path.

import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { StructuredRequest, SummarizeRequest, SummarizeRequestItem, SummarizeResult, SummarizeResultItem } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import type { NormalizeImageBytes } from "../kit/index.ts";
import { toAnthImageBlock } from "../kit/index.ts";
import { logProviderSummarize } from "./log.ts";
import { sanitizeAnthropicOutputSchema } from "./output-schema.ts";
import { disciplineOptions, observabilityOptions } from "./translate.ts";
import type { AgentSdkDeps } from "./types.ts";
import { assertInitFrameShape } from "./verify.ts";

// The agent-sdk sub summarizer accepts BOTH role requests: plain `summarize` (prose) + `structured` (schema).
// `responseFormat` is present only on the structured arm (the union narrows it optional). agent-sdk stays OUT
// of the `structured` ROLE at the dispatcher (its structured channel is the chat outputFormat path); this impl
// just keeps the sub-as-schema-summarizer capability when a caller hands it a StructuredRequest directly.
type SubBatchRequest = SummarizeRequest | StructuredRequest;

const SDK_TITLE_SUMMARIZE = "orbweaver-summarize";
const SUMMARIZE_ITEM_TIMEOUT_MS = 120_000;
// The env-floor fallback when compose doesn't inject the resolved concurrency getter (tests). Byte-identical
// to the former hardcoded SUMMARIZE_CONCURRENCY; the live value comes from deps.summarizeConcurrency (Q6).
const SUMMARIZE_CONCURRENCY_FALLBACK = 4;
const TEXT_TYPE = "text";
const USER_ROLE = "user";

// MA-10: an image-bearing summarize item rides the SDK STREAMING-INPUT prompt (an `AsyncIterable<SDKUserMessage>`
// whose `message` is a full Anthropic `MessageParam`) so the model receives real image content blocks — the
// mode-1 Max sub is a Claude model, so it reads them. A text-only item stays a plain-string prompt (byte-stable
// with the pre-MA-10 turn). Built async because the byte-image normalize is I/O-bound (GIF → first-frame PNG).
async function buildSummarizePrompt(item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<string | AsyncIterable<SDKUserMessage>> {
  if (item.images === undefined || item.images.length === 0) {
    return item.userPrompt;
  }
  const imageBlocks = await Promise.all(item.images.map((image) => toAnthImageBlock(image, normalize)));
  const content: ContentBlockParam[] = [{ type: TEXT_TYPE, text: item.userPrompt }, ...imageBlocks];
  const message: SDKUserMessage = { type: USER_ROLE, message: { role: USER_ROLE, content }, parent_tool_use_id: null };
  return (async function* single(): AsyncIterable<SDKUserMessage> {
    // A one-shot input stream: yield the single image-bearing user message, then close so the SDK runs one
    // turn. The `await` satisfies useAwait and matches the family's streaming-input convention.
    await Promise.resolve();
    yield message;
  })();
}

interface SummarizeTurnResult {
  readonly reply: string;
  readonly structuredOutput: unknown;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly costUsd: number | null;
  readonly ok: boolean;
  readonly terminalReason: string | null;
}

// Matches the vLLM guided-decoding convention: compact JSON, so a consumer can't tell a vLLM box from the sub apart.
function serializeStructured(structuredOutput: unknown, model: string): string {
  if (structuredOutput === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "agent-sdk: summarize requested a jsonSchema but the turn produced no structured_output frame.",
      model,
    });
  }
  return JSON.stringify(structuredOutput).trim();
}

function toItem(turn: SummarizeTurnResult, hadSchema: boolean, model: string): SummarizeResultItem {
  const text = hadSchema ? serializeStructured(turn.structuredOutput, model) : turn.reply.trim();
  return {
    text,
    usage: { tokensIn: turn.tokensIn, tokensOut: turn.tokensOut, costUsd: turn.costUsd },
  };
}

interface SummarizeAcc {
  reply: string;
  structuredOutput: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ok: boolean;
  terminalReason: string | null;
}

function accumulateAssistant(acc: SummarizeAcc, message: Extract<SDKMessage, { type: "assistant" }>): void {
  for (const block of message.message.content) {
    if (block.type === "text") {
      acc.reply += block.text;
    }
  }
}

function accumulateResult(acc: SummarizeAcc, message: Extract<SDKMessage, { type: "result" }>): void {
  acc.ok = !message.is_error && message.subtype === "success";
  acc.terminalReason = message.terminal_reason ?? null;
  acc.costUsd = message.total_cost_usd;
  // `input_tokens`/`output_tokens` are non-optional `number` on the SDK's `BetaUsage` — always present.
  acc.tokensIn = message.usage.input_tokens;
  acc.tokensOut = message.usage.output_tokens;
  if (message.subtype === "success") {
    acc.structuredOutput = message.structured_output;
  }
}

async function reduceSummarizeStream(stream: AsyncIterable<SDKMessage>): Promise<SummarizeTurnResult> {
  const acc: SummarizeAcc = {
    reply: "",
    structuredOutput: undefined,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
    ok: false,
    terminalReason: null,
  };
  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") {
      assertInitFrameShape(message);
    } else if (message.type === "assistant") {
      accumulateAssistant(acc, message);
    } else if (message.type === "result") {
      accumulateResult(acc, message);
    }
  }
  return { ...acc };
}

async function runSummarizeItem(req: SubBatchRequest, item: SummarizeRequestItem, deps: AgentSdkDeps): Promise<SummarizeTurnResult> {
  const abortController = new AbortController();
  if (req.signal !== undefined) {
    if (req.signal.aborted) {
      abortController.abort();
    } else {
      req.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(
        new ProviderError({
          kind: "server",
          retryable: true,
          message: `agent-sdk: summarize item exceeded the ${SUMMARIZE_ITEM_TIMEOUT_MS}ms watchdog`,
          model: req.model,
        }),
      );
    }, SUMMARIZE_ITEM_TIMEOUT_MS);
    timer.unref();
  });
  const responseFormat = "responseFormat" in req ? req.responseFormat : undefined;
  const outputFormat: Pick<Options, "outputFormat"> =
    responseFormat !== undefined ? { outputFormat: { type: "json_schema", schema: sanitizeAnthropicOutputSchema(responseFormat.schema, req.model) } } : {};
  // MA-10: images ride the streaming-input prompt as Anthropic content blocks (the pin at doc 05 §IC-B is
  // LIFTED — the SDK prompt IS `string | AsyncIterable<SDKUserMessage>`, and `SDKUserMessage.message` is a full
  // `MessageParam` that carries image blocks). Text-only items keep the byte-identical plain-string prompt.
  const prompt = await buildSummarizePrompt(item, deps.normalizeImageBytes);
  const stream = deps.query({
    prompt,
    options: {
      ...disciplineOptions(req.credential, undefined, {
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
      }),
      ...observabilityOptions(),
      model: req.model,
      // maxTurns:2 not 1: the runtime's own structured-output validation retry consumes a turn.
      maxTurns: 2,
      systemPrompt: item.systemPrompt,
      title: SDK_TITLE_SUMMARIZE,
      ...outputFormat,
      abortController,
    },
  });
  try {
    const turn = await Promise.race([reduceSummarizeStream(stream), watchdog]);
    if (!turn.ok) {
      throw new ProviderError({
        kind: "server",
        retryable: true,
        message: `agent-sdk: summarize turn failed (${turn.terminalReason ?? "no result frame"})`,
        model: req.model,
        ...(turn.terminalReason !== null ? { terminalReason: turn.terminalReason } : {}),
      });
    }
    return turn;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    abortController.abort();
  }
}

export async function summarize(req: SubBatchRequest, deps: AgentSdkDeps): Promise<SummarizeResult> {
  if (req.credential.source !== "max-pro-sub") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `agent-sdk: summarize serves only the Max sub (max-pro-sub); source "${req.credential.source}" must use the hosted (openrouter) summarize path.`,
      model: req.model,
    });
  }

  await deps.refreshHostSubToken();

  const startedAt = deps.now();
  // `responseFormat` is present only on the StructuredRequest arm of the union (where it's required).
  const hadSchema = "responseFormat" in req;
  const items: (SummarizeResultItem | undefined)[] = new Array(req.inputs.length).fill(undefined);
  let ok = 0;
  let fail = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < req.inputs.length) {
      const i = next;
      next += 1;
      const input = req.inputs[i];
      if (input === undefined) {
        break;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: the worker pulls items serially; concurrency is the worker COUNT (mirrors the vLLM surface).
        const turn = await runSummarizeItem(req, input, deps);
        items[i] = toItem(turn, hadSchema, req.model);
        ok += 1;
      } catch (error) {
        // A single failure fails the whole batch: count it, then re-throw so Promise.all rejects.
        fail += 1;
        logProviderSummarize({
          items: req.inputs.length,
          ok,
          fail,
          durationMs: deps.now() - startedAt,
        });
        throw error;
      }
    }
  };
  const concurrency = deps.summarizeConcurrency?.() ?? SUMMARIZE_CONCURRENCY_FALLBACK;
  const workerCount = Math.min(concurrency, req.inputs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logProviderSummarize({ items: req.inputs.length, ok, fail, durationMs: deps.now() - startedAt });
  return { items: items as SummarizeResultItem[], model: req.model };
}
