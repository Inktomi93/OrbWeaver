// The direct wire's CLASSIFIER-BLOCK fold (inference audit A5). A Fable safety block is a 200 with the V4 finish
// `content-filter` and, when the API attaches one, `providerMetadata.anthropic.stopDetails` (the category + a
// human explanation; the SDK's `mapAnthropicStopDetails`, `@ai-sdk/anthropic/dist/index.js:6140-6150`); when
// the caller asked for `fallbacks` the API may have retried server-side, which `usage.iterations` records as a
// `fallback_message` entry with the model that answered. All of it lands on the EXISTING `refusal` ChatEvent —
// the same member the agent-sdk wire emits from its `model_refusal_*` frames — so a consumer reads one shape.
// Branch on the FINISH REASON, never on `stop_details` presence: the API may refuse with no details at all.

import { z } from "zod";
import type { ChatEvent } from "../../contract/events.ts";
import type { StreamDrain } from "../v4/stream.ts";
import { ANTHROPIC_KEY } from "./model.ts";

const CONTENT_FILTER = "content-filter";
const FALLBACK_ITERATION = "fallback_message";

const refusalMetadataSchema = z.object({
  stopDetails: z.object({ category: z.string().optional(), explanation: z.string().optional() }).optional(),
  iterations: z.array(z.object({ type: z.string(), model: z.string().optional() })).nullish(),
});

type RefusalEvent = Extract<ChatEvent, { readonly kind: "refusal" }>;

/** The refusal event for a drained turn, or `null` when the turn was not classifier-blocked. */
export function refusalEventOf(drain: StreamDrain, model: string, at: number): RefusalEvent | null {
  if (drain.finish.unified !== CONTENT_FILTER) {
    return null;
  }
  const parsed = refusalMetadataSchema.safeParse(drain.providerMetadata?.[ANTHROPIC_KEY]);
  const stopDetails = parsed.success ? parsed.data.stopDetails : undefined;
  const fallback = parsed.success ? parsed.data.iterations?.find((iteration) => iteration.type === FALLBACK_ITERATION) : undefined;
  return {
    kind: "refusal",
    at,
    model,
    category: stopDetails?.category ?? null,
    explanation: stopDetails?.explanation ?? null,
    retried: fallback !== undefined,
    fallbackModel: fallback?.model ?? null,
  };
}
