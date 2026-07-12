// infra/providers/backends/agent-sdk/summarize — the agent-sdk SUMMARIZE role: the Max sub (mode-1) as a
// selectable summarizer, schema-validated output on sub quota. A request SHAPER over a stateless utility
// turn (sibling to verify-auth's linear frame read), NOT a new pipeline: one tool-less, `maxTurns:2`, NO
// session store/resume spawn per input item, reduced by a linear (init → assistant → result) read.
//
// WHY STATELESS (no resume): a summary is a one-shot utility turn — it has no per-chat prompt-cache lineage
// to preserve (unlike a roleplay turn). Each item is an independent spawn through the SAME firewall base a
// real turn uses (`disciplineOptions` → the mode-1 `buildClaudeSdkEnv` host-login path).
//
// MODE-1 ONLY (v1): only the Max sub (`credential.source: "max-pro-sub"`) is served here. A non-mode-1
// credential fails closed with a typed `invalid` error pointing at the hosted (OpenRouter) summarize path —
// the OR backend ALREADY serves hosted summarize; the agent-sdk skin would add nothing here but tier-map
// coupling (the OR-skin mode-2 path exists for chat/agent, not for this utility role).
//
// STRUCTURED OUTPUT (cross-backend byte-parity): `req.jsonSchema` set → the SDK `outputFormat:{type:
// "json_schema", schema}`; the item's `text` = the result frame's `structured_output` serialized with
// `JSON.stringify` (compact — no indent), matching the vLLM guided-decoding convention where the JSON rides
// the completion's content STRING verbatim (vllm/surfaces/summarize → engine/chat-completion `response_
// format`, whose `message.content` is the raw JSON text the surface `.trim()`s onto `item.text`). A consumer
// parsing `item.text` cannot tell a vLLM box from the sub apart. No jsonSchema → the plain reply text.

import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SummarizeRequest,
  SummarizeRequestItem,
  SummarizeResult,
  SummarizeResultItem,
} from "../../contract";
import { ProviderError } from "../../contract";
import { logProviderSummarize } from "./log";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";
import { assertInitFrameShape } from "./verify";

/** The `options.title` for a summarize turn — a STATIC metadata label in the SDK's transcript store (a
 *  utility turn has no chatId to derive from). RP-content doctrine keeps user text out of runtime metadata. */
const SDK_TITLE_SUMMARIZE = "orbweaver-summarize";
/** Per-item watchdog (ms): a single utility turn must never hang the batch. Past this the item's spawn is
 *  aborted and the batch fails closed (whole-batch semantics — see the worker pool). */
const SUMMARIZE_ITEM_TIMEOUT_MS = 120_000;
/** Bounded parallelism over the batch — MIRRORS the vLLM summarize surface (bounded workers feeding the
 *  engine's continuous batcher). Each item is an independent stateless spawn, so a small pool overlaps the
 *  spawn/round-trip latency without a fan-out storm. */
const SUMMARIZE_CONCURRENCY = 4;

/** One reduced utility-turn frame read — the reply text, the structured output (when the turn ran with an
 *  `outputFormat`), token usage, and the failure verdict. */
interface SummarizeTurnResult {
  readonly reply: string;
  readonly structuredOutput: unknown;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly costUsd: number | null;
  readonly ok: boolean;
  readonly terminalReason: string | null;
}

/** Serialize the frame's `structured_output` to MATCH the vLLM convention: the JSON as a COMPACT string
 *  (no indent — the model emits compact guided-decoding JSON on the vLLM path), `.trim()`ed onto the item's
 *  `text`. `undefined` (a schema turn that produced no structured frame) is a fail-closed provider error at
 *  the call site — NEVER a silent empty string the consumer mis-parses. */
function serializeStructured(structuredOutput: unknown, model: string): string {
  if (structuredOutput === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message:
        "agent-sdk: summarize requested a jsonSchema but the turn produced no structured_output frame.",
      model,
    });
  }
  return JSON.stringify(structuredOutput).trim();
}

/** Map a reduced turn onto a {@link SummarizeResultItem}. `jsonSchema` set → the serialized structured
 *  output (byte-parity with vLLM); else the plain reply text. `costUsd` is the sub's metered turn cost. */
function toItem(turn: SummarizeTurnResult, hadSchema: boolean, model: string): SummarizeResultItem {
  const text = hadSchema ? serializeStructured(turn.structuredOutput, model) : turn.reply.trim();
  return {
    text,
    usage: { tokensIn: turn.tokensIn, tokensOut: turn.tokensOut, costUsd: turn.costUsd },
  };
}

/** The mutable accumulator the linear frame read threads (split from the loop so its per-frame branches stay
 *  under the cognitive-complexity budget). */
interface SummarizeAcc {
  reply: string;
  structuredOutput: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ok: boolean;
  terminalReason: string | null;
}

/** Append the assistant frame's text blocks to the running reply. */
function accumulateAssistant(
  acc: SummarizeAcc,
  message: Extract<SDKMessage, { type: "assistant" }>,
): void {
  for (const block of message.message.content) {
    if (block.type === "text") {
      acc.reply += block.text;
    }
  }
}

/** Read the result frame — the failure verdict, token usage, cost, and (on success) `structured_output`. */
function accumulateResult(
  acc: SummarizeAcc,
  message: Extract<SDKMessage, { type: "result" }>,
): void {
  acc.ok = !message.is_error && message.subtype === "success";
  acc.terminalReason = message.terminal_reason ?? null;
  acc.costUsd = message.total_cost_usd;
  acc.tokensIn = message.usage.input_tokens ?? null;
  acc.tokensOut = message.usage.output_tokens ?? null;
  if (message.subtype === "success") {
    acc.structuredOutput = message.structured_output;
  }
}

/** Linear (init → assistant → result) frame read of ONE stateless utility turn — the sibling of
 *  verify-auth's `reduceVerifyStream`, extended to capture `structured_output` + token usage. A failed
 *  result frame (`is_error` / a non-success subtype) surfaces `ok:false` so the caller fails the batch. */
async function reduceSummarizeStream(
  stream: AsyncIterable<SDKMessage>,
): Promise<SummarizeTurnResult> {
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

/** Run ONE stateless summarize turn for a single input item, bounded by the per-item watchdog. Aborts the
 *  spawn (and the reduce) on timeout / caller cancel, and fails closed with a typed error on a failed result
 *  frame — the whole batch then rejects (mirrors the vLLM/OR whole-batch-on-first-error convention). */
async function runSummarizeItem(
  req: SummarizeRequest,
  item: SummarizeRequestItem,
  deps: AgentSdkDeps,
): Promise<SummarizeTurnResult> {
  // Own AbortController: the watchdog OR the caller's signal aborts the spawn. The finally interrupts the
  // still-open SDK Query so a hung turn can't outlive the batch.
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
    timer.unref?.();
  });
  // Structured output: map the jsonSchema to the SDK `outputFormat` (byte-parity with the vLLM guided-
  // decoding path). Built as a `Pick` so the conditional spread doesn't widen `outputFormat` to optional-
  // undefined under exactOptionalPropertyTypes (the agent-runner pattern).
  // `req.jsonSchema` is the contract's structural `object`; the SDK slot is `Record<string, unknown>` — the
  // same single cast the OR summarize shaper uses (backends/openrouter/index runSummarize).
  const outputFormat: Pick<Options, "outputFormat"> =
    req.jsonSchema !== undefined
      ? { outputFormat: { type: "json_schema", schema: req.jsonSchema as Record<string, unknown> } }
      : {};
  const stream = deps.query({
    prompt: item.userPrompt,
    options: {
      // The firewall base — the mode-1 (max-pro-sub) env path; NO orSkinTierModels applies to the sub (the
      // caller guarantees max-pro-sub, so `disciplineOptions` takes the mode-1 arm). `maxTokens` → the
      // output-cap env override (CLAUDE_CODE_MAX_OUTPUT_TOKENS); temperature/minP/repetitionDetection are
      // DROPPED — the agent-sdk exposes no sampling knobs (the capability descriptor already says so, and
      // this backend cannot honor them: the "drop knobs they can't honor" contract).
      ...disciplineOptions(req.credential, undefined, {
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
      }),
      ...observabilityOptions(),
      model: req.model,
      // maxTurns:2, NOT 1 — the runtime's own structured-output validation retry CONSUMES a turn
      // (probed live 2026-07-10: sonnet-5 × nested digest schema fails `error_max_turns(1)` with
      // turns=0 at maxTurns:1 and completes with turns=2 at maxTurns:2; opus/haiku fit in 1). The
      // second turn is internal retry room, not a second completion — tool-less, output-capped, and
      // an unused ceiling costs nothing.
      maxTurns: 2,
      systemPrompt: item.systemPrompt,
      title: SDK_TITLE_SUMMARIZE,
      // Structured output rides `...outputFormat` (built above). Vision: `item.images` is DROPPED — the
      // agent-sdk utility prompt is a plain string with no clean image-attach seam here (text-only families
      // ignore images — the contract blesses this no-op; see SummarizeRequestItem.images).
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
    // Interrupt the still-open Query so a completed-but-unread or aborted turn can't leak a subprocess.
    abortController.abort();
  }
}

/**
 * The agent-sdk summarize role — the Max sub as a selectable, schema-validated summarizer. Batch-shaped
 * (single → `[item]`); MIRRORS the vLLM surface's bounded-worker fan-out (each item an independent stateless
 * spawn) and its WHOLE-BATCH-on-first-error semantics (a `Promise.all` over the worker pool rejects the
 * batch on the first item failure — there is no per-item error slot in the contract, and the vLLM/OR twins
 * both fail the whole batch). One `provider.summarize` metadata line per batch (items/ok/fail/durationMs).
 */
export async function summarize(
  req: SummarizeRequest,
  deps: AgentSdkDeps,
): Promise<SummarizeResult> {
  // MODE-1 ONLY (v1): reject a non-sub credential up front — hosted summarize already exists via OpenRouter.
  if (req.credential.source !== "max-pro-sub") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `agent-sdk: summarize serves only the Max sub (max-pro-sub); source "${req.credential.source}" must use the hosted (openrouter) summarize path.`,
      model: req.model,
    });
  }

  // Refresh an expired host token before the sub spawns (mode-1 only, and this path is max-pro-sub by the
  // gate above) — same ephemeral-symlink refresh-persistence hole the turn runners guard against.
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
        // A single failure fails the WHOLE batch (the vLLM `Promise.all` / OR sequential-throw convention):
        // count it, then re-throw so `Promise.all` rejects and the remaining workers unwind.
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
  // Every slot is filled (the worker pool covers [0, inputs.length) and any failure rejected above); the
  // cast drops the build-time `undefined` the fixed-size array carried.
  return { items: items as SummarizeResultItem[], model: req.model };
}
