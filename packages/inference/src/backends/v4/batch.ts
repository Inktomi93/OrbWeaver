// The SHARED `summarize` + `structured` batch runner over a V4 `doGenerate` (both hosted wires): one call
// per item, bounded workers, the refusal raised as `kind:"refused"`, the CoT strip on prose only, and ONE
// `provider.<task>-item` line per item for success AND failure. Each wire builds the model + the option slice
// (its own structured vehicle spelling) and hands them in; this file owns the loop and the item mapping.
// Owner ruling 2026-07-27: summarize is summarization, structured is schema-constrained generation — two
// tasks, one wire home, no duplicate loop.

import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4GenerateResult, LanguageModelV4Message } from "@ai-sdk/provider";
import type { SummarizeResult, SummarizeResultItem } from "@orb/contracts/providers";
import type { ImageInput, ResponseFormat } from "@orb/contracts/role-clients";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { SideGenSampling, StructuredRequest, SummarizeRequest, SummarizeRequestItem } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { ProviderLogger } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { mediaFilePart } from "./prompt.ts";
import { measuredCostOf, sdkWarnings } from "./result.ts";

/** A PROSE summary must never carry `<think>…</think>` scaffolding; the STRUCTURED task SKIPS the strip
 *  (constrained output is pure JSON, and a literal `<think>` inside a string value is real content). */
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/gu;
/** The description the forced tool carries when the caller supplied none — a tool with no description is a
 *  measurably worse prompt on every family, and the structured callers describe the SCHEMA, not the act. */
export const STRUCTURED_TOOL_DESCRIPTION = "Record the result. Call this tool exactly once, with the complete result object.";
const BASE64 = "base64";
const DATA_URL_PREFIX = "data:";

/** The normalized batch both task requests project onto. */
export interface BatchRequest {
  readonly connection: Resolved;
  readonly task: "summarize" | "structured";
  readonly inputs: readonly SummarizeRequestItem[];
  readonly responseFormat: ResponseFormat | undefined;
  readonly sampling: SideGenSampling;
  readonly signal: AbortSignal | undefined;
}

export function batchRequestOf(req: SummarizeRequest | StructuredRequest, task: BatchRequest["task"]): BatchRequest {
  return {
    connection: req.connection,
    task,
    inputs: req.inputs,
    responseFormat: task === "structured" && "responseFormat" in req ? req.responseFormat : undefined,
    sampling: req,
    signal: req.signal,
  };
}

export interface BatchRun {
  readonly req: BatchRequest;
  readonly model: LanguageModelV4;
  /** Everything but the prompt and the abort signal — the wire's sampling + structured-vehicle slice. */
  readonly options: Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal">;
  readonly label: string;
  readonly concurrency: number;
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly normalize: NormalizeImageBytes;
  /** The vendor `refusal` field where the wire surfaces one (OpenRouter under its metadata); `""` = none. */
  readonly refusalOf: (result: LanguageModelV4GenerateResult) => string;
  /** What the wire's OWN option builder adjusted before any call (a mandatory-reasoning clamp, a forced tool
   *  downgraded to `auto`). A side-generation batch has no bus, so — like the SDK's drops below — each is ONE
   *  named `provider.resolve-warning` line per batch rather than a silent adjustment. */
  readonly warnings?: readonly ResolvedWarning[] | undefined;
}

/** One image input → a URL a hosted wire accepts: a string passes through (URL / data-URL); raw bytes are
 *  wire-normalized (GIF → first-frame PNG — MA-6) then base64 data-URL-encoded with the normalized mime. */
export async function toImageUrl(image: ImageInput, normalize: NormalizeImageBytes): Promise<string> {
  if (typeof image === "string") {
    return image;
  }
  const { bytes, mediaType } = await normalize(image);
  return `${DATA_URL_PREFIX}${mediaType};base64,${Buffer.from(bytes).toString(BASE64)}`;
}

async function userMessage(item: SummarizeRequestItem, normalize: NormalizeImageBytes): Promise<LanguageModelV4Message> {
  const images: readonly ImageInput[] = item.images ?? [];
  const parts = await Promise.all(images.map(async (image) => mediaFilePart({ kind: "image", url: await toImageUrl(image, normalize) })));
  return { role: "user", content: [{ type: "text", text: item.userPrompt }, ...parts] };
}

function textOf(result: LanguageModelV4GenerateResult): string {
  let out = "";
  for (const part of result.content) {
    if (part.type === "text") {
      out += part.text;
    }
  }
  return out;
}

/** The structured item's reply: the forced call's raw `arguments`, or the JSON text under `response_format`.
 *  A second call means the endpoint IGNORED the no-parallel knob — reported, never dropped silently. */
function structuredReply(result: LanguageModelV4GenerateResult, toolName: string, log: ProviderLogger, index: number): string {
  const calls = result.content.filter((part) => part.type === "tool-call");
  const chosen = calls.find((call) => call.toolName === toolName);
  if (calls.length > 0 && chosen === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `structured response called "${calls[0]?.toolName ?? "unnamed"}" instead of forced tool "${toolName}"`,
    });
  }
  const extra = calls.filter((call) => call !== chosen).map((call) => call.toolName);
  if (extra.length > 0) {
    log.emit("warn", "provider.structured-extra-call", { index, droppedCalls: extra });
  }
  return chosen !== undefined ? chosen.input : textOf(result);
}

async function runItem(run: BatchRun, log: ProviderLogger, item: SummarizeRequestItem, index: number): Promise<SummarizeResultItem> {
  const { req, model, label } = run;
  const hasResponseFormat = req.responseFormat !== undefined;
  const startedAt = run.now();
  const base = { task: req.task, model: req.connection.model, index, hasResponseFormat };
  try {
    const result = await model.doGenerate({
      ...run.options,
      prompt: [{ role: "system", content: item.systemPrompt }, await userMessage(item, run.normalize)],
      ...(req.signal !== undefined ? { abortSignal: req.signal } : {}),
    });
    // §A3, the batch half: `doGenerate().warnings` is the SAME second gate the streaming path surfaces, and
    // it was read by nobody. A side-generation turn has no bus to carry a `warning` event, so the honest
    // surface is the item's own log line — one per dropped setting, named and greppable.
    for (const warning of sdkWarnings(result.warnings)) {
      log.emit("warn", "provider.sdk-warning", { ...base, code: warning.code, reason: warning.message });
    }
    const refusal = run.refusalOf(result);
    if (refusal !== "") {
      throw new ProviderError({ kind: "refused", retryable: false, message: `the model refused: ${refusal}`, model: req.connection.model });
    }
    const text =
      req.responseFormat === undefined
        ? textOf(result).replace(THINK_BLOCK_RE, "").trim()
        : structuredReply(result, req.responseFormat.name, log, index).trim();
    const tokensIn = result.usage.inputTokens.total ?? null;
    const tokensOut = result.usage.outputTokens.total ?? null;
    log.summarizeItem({
      ...base,
      durationMs: run.now() - startedAt,
      ok: true,
      tokensIn,
      tokensOut,
      finishReason: result.finishReason.raw ?? result.finishReason.unified,
    });
    const measured = measuredCostOf(result.providerMetadata, result.usage.raw);
    return { text, usage: { tokensIn, tokensOut, costUsd: measured === null ? null : measured.costUsd } };
  } catch (err) {
    const prefix = `${label} item ${index} failed`;
    const failure =
      err instanceof ProviderError ? err.rewrap(`${prefix}: ${err.message}`) : providerErrorFromHttp(err, prefix, resolvedScrubSet(req.connection));
    log.summarizeItem({ ...base, durationMs: run.now() - startedAt, ok: false, tokensIn: null, tokensOut: null, finishReason: null, errorKind: failure.kind });
    throw failure;
  }
}

export async function runV4Batch(run: BatchRun): Promise<SummarizeResult> {
  const { req } = run;
  const log = providerLogger(run.log, req.connection.wire, req.connection.providerId);
  for (const warning of run.warnings ?? []) {
    log.emit("warn", "provider.resolve-warning", { task: req.task, model: req.connection.model, code: warning.code, reason: warning.message });
  }
  const items: (SummarizeResultItem | undefined)[] = new Array(req.inputs.length).fill(undefined);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next; i < req.inputs.length; i = next) {
      next += 1;
      const input = req.inputs[i];
      if (input !== undefined) {
        items[i] = await runItem(run, log, input, i);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(run.concurrency, 1), req.inputs.length) }, () => worker()));
  return { items: items.filter((item): item is SummarizeResultItem => item !== undefined), model: req.connection.model };
}
