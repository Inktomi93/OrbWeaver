// vLLM summarize role surface: a request SHAPER over the gen chat-completion core, not a separate engine.
// Maps the batch contract onto engine/chat-completion and owns the batch concurrency policy (bounded
// workers feeding vLLM's continuous batcher).

import type { SummarizeRequest, SummarizeResult, SummarizeResultItem } from "../../contract";
import type { VllmChatCompletionResult, VllmEngineClient } from "../engine";
import { runVllmChatCompletion } from "../engine";

// Defensive CoT strip: the contract's summary text must never carry `<think>…</think>` scaffolding (the
// default gen model is Instruct/no-thinking, but a future Thinking checkpoint would emit it).
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;

export interface VllmSummarizeDeps {
  readonly client: VllmEngineClient;
  readonly concurrency: number;
}

function toItem(r: VllmChatCompletionResult): SummarizeResultItem {
  return {
    text: r.text.replace(THINK_BLOCK_RE, "").trim(),
    // Local inference — no billing meter.
    usage: { tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: null },
  };
}

/** Bind the summarize role to the engine client + knobs. */
export function createVllmSummarize(deps: VllmSummarizeDeps): (req: SummarizeRequest) => Promise<SummarizeResult> {
  return async (req) => {
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
        const result = await runVllmChatCompletion(deps.client, {
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
        });
        items[i] = toItem(result);
      }
    };
    const workerCount = Math.min(deps.concurrency, req.inputs.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Every slot is filled by the worker pool; the cast drops the build-time `undefined`.
    return { items: items as SummarizeResultItem[], model: req.model };
  };
}
