// infra/providers/backends/anth-direct/summarize — the `summarize` role on the direct Anthropic-Messages
// wire (MA-10 vision parity). A request shaper over a single stateless utility turn per item: the item's
// system prompt + one user message whose content is the instruction text plus (when the item carries images)
// Anthropic `image` content blocks — so a hosted Claude captioner reads the picture instead of the ARM
// silently dropping it. Reuses the family's shared stream reducer; imports only `backends/kit` DOWN + the SDK.
//
// Batch-shaped, ONE turn per item run SEQUENTIALLY (the OR-per-key rate-limit note the OpenRouter summarize
// shaper carries — a parallel fan-out on one key trips 429s; the first-party key is no more forgiving).
//
// CHARTER LIMITS (honest, never a silent drop): the direct wire here is tool-less AND structured-output-less
// — a `responseFormat` request fails closed with a typed error (the Anthropic structured-output beta wire +
// its schema sanitizer live on the agent-sdk backend, D93). `minP` is a vLLM-only knob (absent from this
// wire). Sampling is passed only when a caller set it; the summarize shaper does NOT run the D89 per-model
// sampling-capability gate (no summarize-role caller sets sampling today — a future post-4.6 model + explicit
// temperature would 400 LOUDLY at the wire, never a silent degrade).

import type { MessageCreateParamsStreaming, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SummarizeRequest, SummarizeRequestItem, SummarizeResult, SummarizeResultItem } from "../../contract";
import { ProviderError } from "../../contract";
import type { NormalizeImageBytes } from "../kit";
import { toAnthImageBlock } from "../kit";
import type { AnthClient } from "./client";
import { reduceAnthStream } from "./reducer";

// The summary text must never carry `<think>…</think>` scaffolding (defensive — the reducer already routes
// thinking deltas to a separate channel, but a stray inline block is stripped like the OR/vLLM twins).
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/g;
const TEXT_TYPE = "text";
const USER_ROLE = "user";
// The Anthropic wire REQUIRES `max_tokens`; when a caller sets none, cap generously — a caption/summary is
// short, so this is a ceiling the model stops well under, not a target.
const DEFAULT_SUMMARIZE_MAX_TOKENS = 4096;

/** The deps the backend factory injects: the clock (reducer ttft) + the shared image-normalize seam. */
export interface AnthDirectSummarizeDeps {
  readonly now: () => number;
  readonly normalize: NormalizeImageBytes;
}

// One summarize item → the Anthropic user-message content. No images ⇒ the plain-string content (byte-stable
// with a text-only turn); with images ⇒ the instruction text block first, then one `image` block per image in
// order (the same ordering the OpenRouter multimodal summarize shaper emits).
async function summarizeUserContent(item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<MessageParam["content"]> {
  if (item.images === undefined || item.images.length === 0) {
    return item.userPrompt;
  }
  const imageBlocks = await Promise.all(item.images.map((image) => toAnthImageBlock(image, normalize)));
  return [{ type: TEXT_TYPE, text: item.userPrompt }, ...imageBlocks];
}

async function buildParams(req: SummarizeRequest, item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<MessageCreateParamsStreaming> {
  const content = await summarizeUserContent(item, normalize);
  return {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_SUMMARIZE_MAX_TOKENS,
    system: item.systemPrompt,
    messages: [{ role: USER_ROLE, content }],
    stream: true,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  };
}

async function runItem(client: AnthClient, req: SummarizeRequest, item: SummarizeRequestItem, deps: AnthDirectSummarizeDeps): Promise<SummarizeResultItem> {
  const params = await buildParams(req, item, deps.normalize);
  const stream = await client.messages.create(params, req.signal !== undefined ? { signal: req.signal } : undefined);
  const reduced = await reduceAnthStream(stream, {
    chatId: castId<ChatId>(""),
    startedAt: deps.now(),
    now: deps.now,
  });
  const text = reduced.reply.replace(THINK_BLOCK_RE, "").trim();
  return {
    text,
    // The Messages API returns no per-generation cost tail on `/v1/messages` (the chat runner's `costUsd:0`
    // precedent) — cost is `null` here, tokens are the reduced stream counts.
    usage: { tokensIn: reduced.inputTokens, tokensOut: reduced.outputTokens, costUsd: null },
  };
}

/** Run the direct-Anthropic summarize batch. The credential is already the resolved key (the family factory
 *  ran the fail-closed guard) and `client` is the belted per-key SDK client. */
export async function runAnthDirectSummarize(client: AnthClient, req: SummarizeRequest, deps: AnthDirectSummarizeDeps): Promise<SummarizeResult> {
  if (req.responseFormat !== undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "anth-direct: summarize does not serve structured output (responseFormat) — route a schema turn to the agent-sdk or a vLLM summarizer.",
      model: req.model,
    });
  }
  const items: SummarizeResultItem[] = [];
  for (const input of req.inputs) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design (OR/first-party per-key rate limits); the per-item image normalize rides the same loop.
    items.push(await runItem(client, req, input, deps));
  }
  return { items, model: req.model };
}
