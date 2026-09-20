// Agent-sdk summarize + structured: the subscription as a selectable summarizer. A request shaper over a
// stateless utility turn (tool-less, maxTurns:2, no session resume) — each item is an independent spawn under
// the funder's own runtime dir, reduced by a linear init→assistant→result read. Serves both tasks: `summarize`
// (prose) and `structured` (the SDK's own json_schema output format — compact JSON, the same convention every
// other wire's structured item follows).

import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SummarizeResult, SummarizeResultItem } from "@orb/contracts/providers";
import { AGENT_SDK_CONCURRENCY_MAX } from "@orb/contracts/settings";
import { ProviderError } from "../../contract/errors.ts";
import type { StructuredRequest, SummarizeRequest, SummarizeRequestItem } from "../../contract/roles.ts";
import type { AnthImageBlock } from "../kit/anth-image-block.ts";
import { toAnthImageBlock } from "../kit/anth-image-block.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { AgentSdkLog } from "./log.ts";
import { sanitizeAnthropicOutputSchema } from "./output-schema.ts";
import { linkAbort } from "./runner.ts";
import { disciplineOptions, observabilityOptions } from "./translate.ts";
import type { AgentSdkDeps } from "./types.ts";
import { assertInitFrameShape } from "./verify.ts";

type SubBatchRequest = SummarizeRequest | StructuredRequest;

const SDK_TITLE_SUMMARIZE = "orbweaver-summarize";
const SUMMARIZE_ITEM_TIMEOUT_MS = 120_000;
const TEXT_TYPE = "text";
const USER_ROLE = "user";

type UserContentBlock = { readonly type: "text"; readonly text: string } | AnthImageBlock;

// An image-bearing item rides the SDK STREAMING-INPUT prompt (a full Anthropic `MessageParam`) so the model
// receives real image blocks; a text-only item stays a plain-string prompt (byte-stable).
async function buildSummarizePrompt(item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<string | AsyncIterable<SDKUserMessage>> {
  if (item.images === undefined || item.images.length === 0) {
    return item.userPrompt;
  }
  const imageBlocks = await Promise.all(item.images.map((image) => toAnthImageBlock(image, normalize)));
  const content: UserContentBlock[] = [{ type: TEXT_TYPE, text: item.userPrompt }, ...imageBlocks];
  const message: SDKUserMessage = { type: USER_ROLE, message: { role: USER_ROLE, content }, parent_tool_use_id: null };
  return (async function* single(): AsyncIterable<SDKUserMessage> {
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

function serializeStructured(structuredOutput: unknown, model: string): string {
  if (structuredOutput === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "agent-sdk: structured requested a jsonSchema but the turn produced no structured_output frame.",
      model,
    });
  }
  return JSON.stringify(structuredOutput).trim();
}

function toItem(turn: SummarizeTurnResult, hadSchema: boolean, model: string): SummarizeResultItem {
  return {
    text: hadSchema ? serializeStructured(turn.structuredOutput, model) : turn.reply.trim(),
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

function accumulateResult(acc: SummarizeAcc, message: Extract<SDKMessage, { type: "result" }>): void {
  acc.ok = !message.is_error && message.subtype === "success";
  acc.terminalReason = message.terminal_reason ?? null;
  acc.costUsd = message.total_cost_usd;
  acc.tokensIn = message.usage.input_tokens;
  acc.tokensOut = message.usage.output_tokens;
  if (message.subtype === "success") {
    acc.structuredOutput = message.structured_output;
  }
}

async function reduceSummarizeStream(stream: AsyncIterable<SDKMessage>): Promise<SummarizeTurnResult> {
  const acc: SummarizeAcc = { reply: "", structuredOutput: undefined, tokensIn: null, tokensOut: null, costUsd: null, ok: false, terminalReason: null };
  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") {
      assertInitFrameShape(message);
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          acc.reply += block.text;
        }
      }
    } else if (message.type === "result") {
      accumulateResult(acc, message);
    }
  }
  return { ...acc };
}

async function runSummarizeItem(req: SubBatchRequest, item: SummarizeRequestItem, deps: AgentSdkDeps, log: AgentSdkLog): Promise<SummarizeTurnResult> {
  const { connection } = req;
  const abortController = linkAbort(req.signal);
  let cancelWatchdog: (() => void) | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    cancelWatchdog = deps.scheduleTimeout(() => {
      abortController.abort();
      reject(
        new ProviderError({
          kind: "server",
          retryable: true,
          message: `agent-sdk: summarize item exceeded the ${SUMMARIZE_ITEM_TIMEOUT_MS}ms watchdog`,
          model: connection.model,
        }),
      );
    }, SUMMARIZE_ITEM_TIMEOUT_MS);
  });
  const responseFormat = "responseFormat" in req ? req.responseFormat : undefined;
  const outputFormat: Pick<Options, "outputFormat"> =
    responseFormat !== undefined
      ? { outputFormat: { type: "json_schema", schema: sanitizeAnthropicOutputSchema(responseFormat.schema, connection.model) } }
      : {};
  const prompt = await buildSummarizePrompt(item, deps.normalizeImageBytes);
  const stream = deps.query({
    prompt,
    options: {
      ...disciplineOptions(deps.childEnv(connection, { ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}) })),
      ...observabilityOptions(deps.debug, log),
      model: connection.model,
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
        model: connection.model,
        ...(turn.terminalReason !== null ? { terminalReason: turn.terminalReason } : {}),
      });
    }
    return turn;
  } finally {
    cancelWatchdog?.();
    abortController.abort();
  }
}

export async function summarize(req: SubBatchRequest, deps: AgentSdkDeps, log: AgentSdkLog): Promise<SummarizeResult> {
  const { connection } = req;
  const startedAt = deps.now();
  const hadSchema = "responseFormat" in req;
  const items: (SummarizeResultItem | undefined)[] = new Array(req.inputs.length).fill(undefined);
  let ok = 0;
  let fail = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next; i < req.inputs.length; i = next) {
      next += 1;
      const input = req.inputs[i];
      if (input === undefined) {
        break;
      }
      try {
        items[i] = toItem(await runSummarizeItem(req, input, deps, log), hadSchema, connection.model);
        ok += 1;
      } catch (error) {
        fail += 1;
        log.summarize({ items: req.inputs.length, ok, fail, durationMs: deps.now() - startedAt });
        throw error;
      }
    }
  };
  const concurrency = deps.summarizeConcurrency();
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0 || concurrency > AGENT_SDK_CONCURRENCY_MAX) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `agent-sdk: summarize concurrency must be a finite positive integer at most ${AGENT_SDK_CONCURRENCY_MAX}`,
      model: connection.model,
    });
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, req.inputs.length) }, () => worker()));
  log.summarize({ items: req.inputs.length, ok, fail, durationMs: deps.now() - startedAt });
  return { items: items.filter((item): item is SummarizeResultItem => item !== undefined), model: connection.model };
}
