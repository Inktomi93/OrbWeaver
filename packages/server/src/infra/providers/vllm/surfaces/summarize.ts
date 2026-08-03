// vLLM `summarize` + `structured` role surfaces: BOTH are a request SHAPER over the ONE gen chat-completion
// core (owner ruling 2026-07-27 — summarize is summarization, structured is schema-constrained generation;
// two roles, one wire home, no duplicate code). Maps the batch contract onto engine/chat-completion and owns
// the batch concurrency policy (bounded workers feeding vLLM's continuous batcher).
//
// OBSERVABILITY (parity with the chat surfaces): each item captures its LITERAL wire body (gated by the
// injected `captureWire` sink — WIRE_CAPTURE at compose) AND emits a `provider.summarize-item` turn log for
// BOTH success and failure, TAGGED BY ROLE (`api:"summarize"` vs `api:"structured"`) so a diagnosis never
// again greps "summarize" to find an rpg extraction. The log rides the shared `logProviderSummarizeItem`
// choke point — never a parallel mechanism.

import type { ResponseFormat } from "@orb/contracts/role-clients";
import { logProviderSummarizeItem } from "../../backends/kit/index.ts";
import type { StructuredRequest, SummarizeRequest, SummarizeResult, SummarizeResultItem, WireCaptureSink } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import type { VllmChatCompletionResult, VllmEngineClient } from "../engine/index.ts";
import { runVllmChatCompletion } from "../engine/index.ts";

const BACKEND = "vllm";

// Defensive CoT strip: a PROSE summary must never carry `<think>…</think>` scaffolding (the default gen model
// is Instruct/no-thinking, but a future Thinking checkpoint would emit it). SKIPPED on the STRUCTURED role
// (S3): schema-constrained output IS pure JSON, and a `<think>…</think>` appearing there is a LEGITIMATE
// literal inside a JSON string VALUE (e.g. a journal-content field quoting the tag) — stripping it would
// excise real content or corrupt the JSON. The strip is a prose-path defense; constrained output doesn't
// carry loose CoT to strip.
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;

export interface VllmSummarizeDeps {
  readonly client: VllmEngineClient;
  readonly concurrency: number;
  readonly now: () => number;
  /** WIRE_CAPTURE sink (parity with the chat surface). Absent ⇒ no capture, zero cost (the compose default). */
  readonly captureWire?: WireCaptureSink | undefined;
}

// The normalized per-role batch request the shared runner consumes — the two role requests (summarize +
// structured) project onto this. `apiTag` is the observability role marker (wire-capture `api` + the log).
interface BatchRequest {
  readonly model: string;
  readonly apiTag: "summarize" | "structured";
  readonly inputs: SummarizeRequest["inputs"];
  readonly responseFormat: ResponseFormat | undefined;
  readonly maxTokens: number | undefined;
  readonly temperature: number | undefined;
  readonly minP: number | undefined;
  readonly repetitionDetection: SummarizeRequest["repetitionDetection"];
  readonly signal: AbortSignal | undefined;
}

// `hasResponseFormat` = the STRUCTURED role (S3): skip the CoT strip so a literal `<think>` inside a JSON
// string value survives (constrained output is pure JSON, not loose prose). Prose (summarize) still strips.
function toItem(r: VllmChatCompletionResult, hasResponseFormat: boolean): SummarizeResultItem {
  const text = hasResponseFormat ? r.text : r.text.replace(THINK_BLOCK_RE, "").trim();
  return {
    text,
    // Local inference — no billing meter.
    usage: { tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: null },
  };
}

// A thrown engine error's classified kind (ProviderError.kind), or a generic marker — never the message body.
function errorKindOf(err: unknown): string {
  return err instanceof ProviderError ? err.kind : "unknown";
}

interface RunItemArgs {
  readonly deps: VllmSummarizeDeps;
  readonly req: BatchRequest;
  readonly input: SummarizeRequest["inputs"][number];
  readonly index: number;
}

// Run ONE item + emit its observability (wire capture + the per-item turn log for success AND failure).
// Extracted from the worker loop so the loop stays under the cognitive-complexity gate. Re-throws on failure
// so the batch still rejects — this adds a log line, never swallows the error.
async function runBatchItem(args: RunItemArgs): Promise<SummarizeResultItem> {
  const { deps, req, input, index } = args;
  const hasResponseFormat = req.responseFormat !== undefined;
  const startedAt = deps.now();
  try {
    const result = await runVllmChatCompletion(
      deps.client,
      {
        model: req.model,
        messages: [
          { role: "system", text: input.systemPrompt },
          { role: "user", text: input.userPrompt, images: input.images },
        ],
        maxTokens: req.maxTokens,
        temperature: req.temperature,
        minP: req.minP,
        responseFormat: req.responseFormat,
        repetitionDetection: req.repetitionDetection,
        signal: req.signal,
      },
      // Capture the LITERAL wire body right before it POSTs (parity with the chat surface); fires only when
      // compose wired a sink. Tagged by ROLE so extraction ≠ summarize in the trail. Never the reply.
      (body) => deps.captureWire?.({ chatId: undefined, api: req.apiTag, backend: BACKEND, model: req.model, body }),
    );
    logProviderSummarizeItem(BACKEND, {
      role: req.apiTag,
      model: req.model,
      index,
      durationMs: deps.now() - startedAt,
      ok: true,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      finishReason: result.finishReason,
      hasResponseFormat,
    });
    return toItem(result, hasResponseFormat);
  } catch (err) {
    logProviderSummarizeItem(BACKEND, {
      role: req.apiTag,
      model: req.model,
      index,
      durationMs: deps.now() - startedAt,
      ok: false,
      tokensIn: null,
      tokensOut: null,
      finishReason: null,
      hasResponseFormat,
      errorKind: errorKindOf(err),
    });
    // Re-throw the ORIGINAL error unchanged — the observability is the log line above; wrapping would only
    // add per-item context that already rides the log (and re-wrapping a ProviderError is the exact
    // `useErrorCause` false-positive this avoids). The engine client already types its throws (ProviderError).
    throw err;
  }
}

// The shared batch runner both roles use: fan the inputs across the bounded worker pool, one gen chat call
// per item, index-aligned. ONE wire home for summarize + structured.
async function runBatch(deps: VllmSummarizeDeps, req: BatchRequest): Promise<SummarizeResult> {
  const items: (SummarizeResultItem | undefined)[] = new Array(req.inputs.length).fill(undefined);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < req.inputs.length) {
      const i = next;
      next += 1;
      const input = req.inputs[i];
      if (input === undefined) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: the worker pulls items serially; concurrency is the worker COUNT.
      items[i] = await runBatchItem({ deps, req, input, index: i });
    }
  };
  const workerCount = Math.min(deps.concurrency, req.inputs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  // Every slot is filled by the worker pool; the cast drops the build-time `undefined`.
  return { items: items as SummarizeResultItem[], model: req.model };
}

/** Bind the `summarize` role (summarization — no schema constraint) to the engine client + knobs. */
export function createVllmSummarize(deps: VllmSummarizeDeps): (req: SummarizeRequest) => Promise<SummarizeResult> {
  return (req) =>
    runBatch(deps, {
      model: req.model,
      apiTag: "summarize",
      inputs: req.inputs,
      responseFormat: undefined,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      minP: req.minP,
      repetitionDetection: req.repetitionDetection,
      signal: req.signal,
    });
}

/** Bind the `structured` role (one-shot schema-constrained generation) to the engine client + knobs. Same
 *  wire home as summarize; `responseFormat` rides the gen chat-completion `response_format` (guided decoding). */
export function createVllmStructured(deps: VllmSummarizeDeps): (req: StructuredRequest) => Promise<SummarizeResult> {
  return (req) =>
    runBatch(deps, {
      model: req.model,
      apiTag: "structured",
      inputs: req.inputs,
      responseFormat: req.responseFormat,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      minP: req.minP,
      repetitionDetection: req.repetitionDetection,
      signal: req.signal,
    });
}
