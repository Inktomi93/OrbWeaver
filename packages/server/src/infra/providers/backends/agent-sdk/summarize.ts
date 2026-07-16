// Agent-sdk summarize role: the Max sub (mode-1) as a selectable, schema-validated summarizer. A request
// shaper over a stateless utility turn (tool-less, maxTurns:2, no session resume) — each item is an
// independent spawn, reduced by a linear init→assistant→result read. Mode-1 only; a non-sub credential
// fails closed toward the hosted (OpenRouter) summarize path.

import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SummarizeRequest, SummarizeRequestItem, SummarizeResult, SummarizeResultItem } from "../../contract";
import { ProviderError } from "../../contract";
import { logProviderSummarize } from "./log";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";
import { assertInitFrameShape } from "./verify";

const SDK_TITLE_SUMMARIZE = "orbweaver-summarize";
const SUMMARIZE_ITEM_TIMEOUT_MS = 120_000;
const SUMMARIZE_CONCURRENCY = 4;

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

async function runSummarizeItem(req: SummarizeRequest, item: SummarizeRequestItem, deps: AgentSdkDeps): Promise<SummarizeTurnResult> {
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
  const outputFormat: Pick<Options, "outputFormat"> =
    req.jsonSchema !== undefined ? { outputFormat: { type: "json_schema", schema: req.jsonSchema as Record<string, unknown> } } : {};
  const stream = deps.query({
    prompt: item.userPrompt,
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
      // item.images is dropped — the agent-sdk utility prompt has no clean image-attach seam here.
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

export async function summarize(req: SummarizeRequest, deps: AgentSdkDeps): Promise<SummarizeResult> {
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
  const hadSchema = req.jsonSchema !== undefined;
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
  const workerCount = Math.min(SUMMARIZE_CONCURRENCY, req.inputs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logProviderSummarize({ items: req.inputs.length, ok, fail, durationMs: deps.now() - startedAt });
  return { items: items as SummarizeResultItem[], model: req.model };
}
