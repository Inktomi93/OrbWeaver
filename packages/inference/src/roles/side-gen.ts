// The one loop for the `summarize` and `structured` tasks on every wire: each item is one non-delivered chat turn on
// the connection's own api, so the wire's chat path is the one request builder for both. This file maps an item
// onto a chat request with the `side-gen` posture and folds the turn back into the item; it spells no wire body.

import type { UserIntent } from "@orb/contracts/preset";
import { rolePresetParamsOf, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import type { SummarizeResult, SummarizeResultItem } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatId } from "@orb/kit/ids";
import type { NormalizeImageBytes } from "../backends/kit/image-normalize.ts";
import { toImageUrl } from "../backends/kit/image-normalize.ts";
import { providerLogger } from "../backends/kit/provider-log.ts";
import type { ChatHistoryMessage, ChatRequest, ChatResult } from "../contract/chat.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import { withPresetWindow } from "../contract/resolved.ts";
import type { StructuredRequest, SummarizeRequest } from "../contract/roles.ts";
import type { InferenceLog } from "../deps.ts";

const SIDE_GEN_POSTURE = "side-gen";
/** A prose item splits inline reasoning out of its reply with the house tag pair, on a row with no native reasoning
 *  field. A structured item does not: a literal tag inside a JSON string value is the payload's own content. */
const PROSE_REASONING_TAGS = { prefix: THINK_PREFIX_DEFAULT, suffix: THINK_SUFFIX_DEFAULT } as const;

/** What the loop needs from the backend that serves the task. */
export interface SideGenDeps {
  /** The wire's own chat turn. */
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** How many items run at once. */
  readonly concurrency: number;
  readonly normalize: NormalizeImageBytes;
  readonly log: InferenceLog;
  readonly now: () => number;
}

/** One side-generation item as a chat turn's inputs: its two prompts and its images as URLs or data URLs. */
export interface SideGenItem {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly images?: readonly string[] | undefined;
}

/** The request one item sends: a non-delivered chat turn on the connection's own api, with the role's params. */
export function sideGenChatRequest(args: {
  readonly connection: Resolved<"chat">;
  readonly item: SideGenItem;
  readonly params: UserIntent;
  readonly responseFormat?: ResponseFormat | undefined;
  readonly chatId?: ChatId | undefined;
  readonly signal?: AbortSignal | undefined;
}): ChatRequest {
  const { connection, item } = args;
  const api = connection.api;
  if (api === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `connection ${connection.connectionId} carries no chat api` });
  }
  const images = item.images ?? [];
  const common = {
    connection,
    params: args.params,
    posture: SIDE_GEN_POSTURE,
    systemPrompt: { static: item.systemPrompt, dynamic: "" },
    ...(args.chatId !== undefined ? { chatId: args.chatId } : {}),
    ...(args.responseFormat !== undefined ? { responseFormat: args.responseFormat } : {}),
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
  } as const;
  if (api === "agent-sdk") {
    return { ...common, api, prompt: item.userPrompt, ...(images.length > 0 ? { promptImages: images } : {}) };
  }
  const row: ChatHistoryMessage = {
    role: "user",
    content: [{ type: "text", text: item.userPrompt }, ...images.map((url) => ({ type: "image", url }) as const)],
  };
  return {
    ...common,
    api,
    history: [row],
    ...(args.responseFormat === undefined ? { reasoningTags: PROSE_REASONING_TAGS } : {}),
  };
}

/** The item a finished turn answered: the reply, which a structured turn already folded to its payload. A refusal
 *  is never an answer, so a refused turn or a filtered finish fails the item. */
export function sideGenReplyOf(result: ChatResult, model: string): string {
  const refused = result.finishReason === "filter" || result.events.some((event) => event.kind === "refusal" && !event.retried);
  if (refused) {
    throw new ProviderError({ kind: "refused", retryable: false, message: "the model refused the request", model });
  }
  return result.reply.trim();
}

/** The role's params as a turn's intent: the request names its output cap `maxTokens`. */
function paramsOf(req: SummarizeRequest | StructuredRequest): UserIntent {
  return { ...rolePresetParamsOf(req), ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}) };
}

function warningKey(warning: ResolvedWarning): string {
  return [warning.code, warning.knob ?? "", warning.key ?? "", warning.message].join("\0");
}

/**
 * Run a summarize or structured batch: each item one chat turn on the connection's own wire, under the role preset's
 * window (`withPresetWindow`), at most `concurrency` at a time, in input order. A failed item stops the batch from
 * starting more; the items already running finish, and the first failure is thrown. Each distinct warning is one
 * `provider.resolve-warning` line per batch, and each item one `provider.<task>-item` line.
 */
export async function runSideGen(req: SummarizeRequest | StructuredRequest, deps: SideGenDeps): Promise<SummarizeResult> {
  const responseFormat = "responseFormat" in req ? req.responseFormat : undefined;
  const task = responseFormat === undefined ? "summarize" : "structured";
  const connection = withPresetWindow({ ...req.connection, task: "chat" }, req.maxContextTokens);
  const params = paramsOf(req);
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const seen = new Set<string>();
  const label = `${connection.providerId} ${task} (${connection.model})`;
  const base = { task, model: connection.model, hasResponseFormat: responseFormat !== undefined } as const;

  const runItem = async (index: number): Promise<SummarizeResultItem> => {
    const input = req.inputs[index];
    if (input === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: no item ${index}` });
    }
    const startedAt = deps.now();
    try {
      const images = await Promise.all((input.images ?? []).map((image) => toImageUrl(image, deps.normalize)));
      const result = await deps.runChatTurn(sideGenChatRequest({ connection, item: { ...input, images }, params, responseFormat, signal: req.signal }));
      for (const event of result.events) {
        if (event.kind === "warning" && !seen.has(warningKey(event))) {
          seen.add(warningKey(event));
          log.emit("warn", "provider.resolve-warning", { task, model: connection.model, code: event.code, reason: event.message });
        }
      }
      const text = sideGenReplyOf(result, connection.model);
      const { tokensIn, tokensOut, costUsd } = result.usage;
      log.summarizeItem({ ...base, index, durationMs: deps.now() - startedAt, ok: true, tokensIn, tokensOut, finishReason: result.stopReason });
      return { text, usage: { tokensIn, tokensOut, costUsd } };
    } catch (err) {
      const failure =
        err instanceof ProviderError
          ? err.rewrap(`${label} item ${index} failed: ${err.message}`)
          : new ProviderError({ kind: "unknown", retryable: false, message: `${label} item ${index} failed`, cause: err });
      log.summarizeItem({
        ...base,
        index,
        durationMs: deps.now() - startedAt,
        ok: false,
        tokensIn: null,
        tokensOut: null,
        finishReason: null,
        errorKind: failure.kind,
      });
      throw failure;
    }
  };

  const items: SummarizeResultItem[] = [];
  const state: { next: number; failure: unknown } = { next: 0, failure: undefined };
  const worker = async (): Promise<void> => {
    while (state.failure === undefined && state.next < req.inputs.length) {
      const index = state.next;
      state.next += 1;
      try {
        items[index] = await runItem(index);
        // @orb-waive caught-failure-ownership(err): the first item failure is held so the items already running settle, then runSideGen rethrows it unchanged as the batch's failure. Ends if that rethrow is removed.
      } catch (err) {
        state.failure ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(deps.concurrency, 1), req.inputs.length) }, () => worker()));
  if (state.failure !== undefined) {
    throw state.failure;
  }
  return { items, model: connection.model };
}
