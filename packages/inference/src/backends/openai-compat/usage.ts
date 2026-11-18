// THE VENDOR USAGE → V4 USAGE MAPPING, on the SDK's own conversion path (`convertUsage`, passed by
// `model.ts` to both `createOpenAICompatible` factories). Adopted from the SDK-surface ledger's "Adopt"
// list (`docs/law/ai-sdk-surface.md` #1).
//
// `convertUsage` REPLACES the whole default mapping — the hook is used when present and the default
// otherwise (`@ai-sdk/openai-compatible` dist `index.js:372-373`), so this file emits everything the
// default emitted (`inputTokens`/`outputTokens`/`raw`, dist `index.js:40-60`). What it adds is the
// reading the default does not do, and the reading the retired `chat.ts` `nativeOpenAiUsageOverlay` did
// but only for `providerId === "openai"` rows spelling `openai-breakpoint`:
//
// - `cache_write_tokens` is read (`prompt_tokens_details.cache_write_tokens`), which the default never
//   looks at (its `cacheWrite` is `void 0`, dist:51). Any endpoint that reports the axis now reports it;
//   the overlay's provider-id gate is gone because the bytes and the meaning are the same on every row.
// - Absent axes STAY absent: the default coerces with `prompt_tokens ?? 0` / `reasoning_tokens ?? 0`,
//   fabricating a reported zero for a frame that said nothing. Here `undefined` leaves the fold's own
//   rules to answer — `null` for the totals and reasoning (`contracts/inference/usage.ts`
//   foldTokenUsage), `0` for the cache axes, whose documented rule is that a wire reporting no cache
//   has no cache. That is the overlay's null-vs-zero discipline, now applied everywhere.
// - `noCache`/`text` keep the default's arithmetic over the facts that ARE reported (total minus read,
//   total minus reasoning), and are `undefined` when the total itself is not, because a derivation with
//   no total underneath it would be a fabricated number.
// - `raw` is the frame as it arrived (JSON-validated, never cast), so `measuredCostOf`'s raw-usage
//   reader on OpenRouter-shaped accounting rows keeps the source the overlay read.

import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { jsonObjectSchema } from "@orb/kit/json";
import { z } from "zod";

/** A vendor-reported count: a non-negative integer, or no fact at all. Junk reads as no fact, never as a number. */
const reportedCount = z.number().int().nonnegative().nullish().catch(null);

/** The vendor's own usage vocabulary, read through validation: the SDK's chunk schema is loose
 *  (`index.js:754-764`), which is why keys it never names — `cache_write_tokens` among them — survive to
 *  this function at all; nothing here trusts a cast. The vendor spellings are computed keys because the
 *  house naming-convention check reads a literal as a member name. */
const usageFrameSchema = z
  .object({
    ["prompt_tokens"]: reportedCount,
    ["completion_tokens"]: reportedCount,
    ["prompt_tokens_details"]: z
      .object({ ["cached_tokens"]: reportedCount, ["cache_write_tokens"]: reportedCount })
      .strip()
      .nullish()
      .catch(null),
    ["completion_tokens_details"]: z
      .object({ ["reasoning_tokens"]: reportedCount })
      .strip()
      .nullish()
      .catch(null),
  })
  .strip();

/** `createNullLanguageModelUsage()`'s shape (provider-utils dist:418-433): every axis unknown, which the
 *  fold turns into `null` totals and the no-cache zero. */
const NULL_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

/** A count the frame did not carry is `undefined` here, so the fold — not this file — decides what an
 *  unreported axis means. */
function reported(count: number | null): number | undefined {
  return count ?? undefined;
}

/** The default mapper's own derivation (`dist:40-60`): what the total does not account for. No total,
 *  no derivation. */
function derived(total: number | null, part: number | null): number | undefined {
  return total === null ? undefined : total - (part ?? 0);
}

/** See the file header. The argument is `unknown` because the SDK types it as its own loose-parsed frame;
 *  reading it through {@link usageFrameSchema} is the validation boundary, not a cast. */
export function openAiCompatConvertUsage(frame: unknown): LanguageModelV4Usage {
  if (frame === null || frame === undefined) {
    return NULL_USAGE;
  }
  const parsed = usageFrameSchema.safeParse(frame);
  if (!parsed.success) {
    return NULL_USAGE;
  }
  const prompt = parsed.data["prompt_tokens"] ?? null;
  const completion = parsed.data["completion_tokens"] ?? null;
  const cacheRead = parsed.data["prompt_tokens_details"]?.["cached_tokens"] ?? null;
  const cacheWrite = parsed.data["prompt_tokens_details"]?.["cache_write_tokens"] ?? null;
  const reasoning = parsed.data["completion_tokens_details"]?.["reasoning_tokens"] ?? null;
  return {
    inputTokens: {
      total: reported(prompt),
      noCache: derived(prompt, cacheRead),
      cacheRead: reported(cacheRead),
      cacheWrite: reported(cacheWrite),
    },
    outputTokens: {
      total: reported(completion),
      text: derived(completion, reasoning),
      reasoning: reported(reasoning),
    },
    raw: jsonObjectSchema.parse(frame),
  };
}
