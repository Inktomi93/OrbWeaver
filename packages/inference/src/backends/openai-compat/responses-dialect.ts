// The `/responses` reasoning-stream dialect. DeepSeek streams reasoning as RAW
// `response.reasoning_text.delta/done` frames (`content_index`-addressed), a spelling `@ai-sdk/openai`'s
// chunk union never modeled: the SDK's catch-all arm silently converts every unknown frame to an
// `unknown_chunk` it ignores, so on this route the reasoning text would vanish — no error, no deltas,
// just silence (deepseek-v4-pro streams `reasoning_text.delta/done` and never a `reasoning_summary_*`
// event; the SDK models only the summary spelling).
//
// The fix rewrites the frames onto the summary spelling the SDK DOES fold, at the fetch seam — the same
// door `ollama-native.ts` translates Ollama's native route through — so the SDK never sees a dialect it
// cannot parse. `reasoning_text.delta` → `reasoning_summary_text.delta` with `summary_index: 0` (the
// delta handler reads only item/delta — a synthetic one-index-0 part needs no `part.added`), and
// `reasoning_text.done` → `reasoning_summary_part.done`. Every other frame rides untouched, including
// the vendor's `response.content_part.*` and `response.output_text.done`, which the SDK's catch-all
// drops — they carry nothing the fold needs. Gated by `features.responsesReasoningStream: "text"`:
// a route that streams BOTH spellings would otherwise double-fold.
//
// Framing, the buffer limit and the data-line spelling are `backends/http/sse.ts`'s; this file holds only the fold.

import type { JsonValue } from "@orb/kit/json";
import { parseJsonText } from "@orb/kit/json";
import { encodeSseData, sseDataPayload, sseFrameTransform } from "../http/sse.ts";

const EVENT_PREFIX = "event:";
const DELTA = "response.reasoning_text.delta";
const DONE = "response.reasoning_text.done";
const SUMMARY_DELTA = "response.reasoning_summary_text.delta";
const SUMMARY_PART_DONE = "response.reasoning_summary_part.done";

/** The fold target for one parsed frame payload, or `undefined` to keep the frame as-is. */
interface Fold {
  readonly payload: Record<string, JsonValue>;
  readonly summaryType: string;
}

function foldOf(record: Record<string, JsonValue>): Fold | undefined {
  const type = record["type"];
  const itemId = typeof record["item_id"] === "string" ? record["item_id"] : undefined;
  if (type === DELTA && itemId !== undefined && typeof record["delta"] === "string") {
    return { payload: { ...record, type: SUMMARY_DELTA, ["summary_index"]: 0 }, summaryType: SUMMARY_DELTA };
  }
  if (type === DONE && itemId !== undefined) {
    const outputIndex = typeof record["output_index"] === "number" ? record["output_index"] : undefined;
    return {
      payload: {
        type: SUMMARY_PART_DONE,
        ["item_id"]: itemId,
        ...(outputIndex === undefined ? {} : { ["output_index"]: outputIndex }),
        ["summary_index"]: 0,
      },
      summaryType: SUMMARY_PART_DONE,
    };
  }
  return undefined;
}

/** Rewrite one SSE frame from the raw-reasoning spelling onto the summary spelling, or `undefined` to keep
 *  it. The frame's other lines ride ahead of the rewritten `event:` and data lines (field order within a
 *  frame carries no meaning), and the data line takes the canonical `data: ` spacing. */
function rewriteFrame(frame: string): string | undefined {
  const lines = frame.split("\n");
  // Multi-line `data:` accumulation is a frame this fold does not name: rewriting one line of it would
  // corrupt it, so it rides untouched.
  const [payload, ...more] = lines.flatMap((line) => sseDataPayload(line) ?? []);
  if (payload === undefined || more.length > 0) {
    return undefined;
  }
  const data = parseJsonText(payload);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  const fold = foldOf(data);
  if (fold === undefined) {
    return undefined;
  }
  const named = lines.some((line) => line.startsWith(EVENT_PREFIX));
  const rest = lines.filter((line) => sseDataPayload(line) === undefined && !line.startsWith(EVENT_PREFIX));
  return [...rest.map((line) => `${line}\n`), named ? `${EVENT_PREFIX} ${fold.summaryType}\n` : "", encodeSseData(fold.payload)].join("");
}

/** The reply translator for a `features.responsesReasoningStream: "text"` row: SSE frames are rewritten
 *  as they stream. */
export function responsesReasoningTextStream(res: Response): Promise<Response> {
  const contentType = res.headers.get("content-type") ?? "";
  if (res.body === null || !contentType.includes("text/event-stream")) {
    return Promise.resolve(res);
  }
  const body = res.body.pipeThrough(sseFrameTransform(rewriteFrame));
  return Promise.resolve(new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}
