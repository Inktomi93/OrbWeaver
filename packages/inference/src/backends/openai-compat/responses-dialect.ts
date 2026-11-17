// The `/responses` reasoning-stream dialect. DeepSeek streams reasoning as RAW
// `response.reasoning_text.delta/done` frames (`content_index`-addressed), a spelling `@ai-sdk/openai`'s
// chunk union never modeled: the SDK's catch-all arm silently converts every unknown frame to an
// `unknown_chunk` it ignores, so on this route the reasoning text would vanish — no error, no deltas,
// just silence (MEASURED 2026-11-17: deepseek-v4-pro streams `reasoning_text.delta/done` and never a
// `reasoning_summary_*` event; the SDK through 4.0.118 knows only the summary spelling).
//
// The fix rewrites the frames onto the summary spelling the SDK DOES fold, at the fetch seam — the same
// door `ollama-native.ts` translates Ollama's native route through — so the SDK never sees a dialect it
// cannot parse. `reasoning_text.delta` → `reasoning_summary_text.delta` with `summary_index: 0` (the
// delta handler reads only item/delta — a synthetic one-index-0 part needs no `part.added`), and
// `reasoning_text.done` → `reasoning_summary_part.done`. Every other frame rides untouched, including
// the vendor's `response.content_part.*` and `response.output_text.done`, which the SDK's catch-all
// drops — they carry nothing the fold needs. Gated by `features.responsesReasoningStream: "text"`:
// a route that streams BOTH spellings would otherwise double-fold.

import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";

const FRAME_SEP = "\n\n";
const DATA_PREFIX = "data:";
const DELTA = "response.reasoning_text.delta";
const DONE = "response.reasoning_text.done";
const SUMMARY_DELTA = "response.reasoning_summary_text.delta";
const SUMMARY_PART_DONE = "response.reasoning_summary_part.done";

function parseData(line: string): JsonValue | undefined {
  if (!line.startsWith(DATA_PREFIX)) {
    return undefined;
  }
  try {
    return jsonValueSchema.parse(JSON.parse(line.slice(DATA_PREFIX.length).trim()));
  } catch (error) {
    // A malformed or non-JSON data frame is folded away (the dialect only rewrites the frames it can
    // name); `JSON.parse` throws only SyntaxError, so anything else is a programming fault and must not
    // be laundered into "no payload".
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return undefined;
  }
}

/** Point the frame's `event:`/`data:` lines at the rewritten payload (the data line is always single-line JSON). */
function refold(frame: string, payload: Record<string, JsonValue>, summaryType: string): string {
  return frame.replace(/^data: .*$/mu, `${DATA_PREFIX} ${JSON.stringify(payload)}`).replace(/^event: .*$/mu, `event: ${summaryType}`);
}

/** Rewrite one SSE frame's data frame from the raw-reasoning spelling onto the summary spelling;
 *  `undefined` keeps the frame as-is. */
function rewriteFrame(frame: string): string | undefined {
  const dataLine = frame.split("\n").find((line) => line.startsWith(DATA_PREFIX));
  if (dataLine === undefined) {
    return undefined;
  }
  const data = parseData(dataLine);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  const record = data as Record<string, JsonValue>;
  const type = record["type"];
  const itemId = typeof record["item_id"] === "string" ? record["item_id"] : undefined;
  const outputIndex = typeof record["output_index"] === "number" ? record["output_index"] : undefined;
  if (type === DELTA && itemId !== undefined && typeof record["delta"] === "string") {
    return refold(frame, { ...record, type: SUMMARY_DELTA, ["summary_index"]: 0 }, SUMMARY_DELTA);
  }
  if (type === DONE && itemId !== undefined) {
    const payload: Record<string, JsonValue> = {
      type: SUMMARY_PART_DONE,
      ["item_id"]: itemId,
      ...(outputIndex === undefined ? {} : { ["output_index"]: outputIndex }),
      ["summary_index"]: 0,
    };
    return refold(frame, payload, SUMMARY_PART_DONE);
  }
  return undefined;
}

/** The reply translator for a `features.responsesReasoningStream: "text"` row: SSE frames are rewritten
 *  as they stream; frame boundaries split across network chunks are buffered. */
export function responsesReasoningTextStream(res: Response): Promise<Response> {
  const contentType = res.headers.get("content-type") ?? "";
  if (res.body === null || !contentType.includes("text/event-stream")) {
    return Promise.resolve(res);
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const body = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        let cut = pending.indexOf(FRAME_SEP);
        while (cut !== -1) {
          const frame = pending.slice(0, cut);
          pending = pending.slice(cut + FRAME_SEP.length);
          const rewritten = rewriteFrame(frame);
          controller.enqueue(encoder.encode(`${rewritten ?? frame}${FRAME_SEP}`));
          cut = pending.indexOf(FRAME_SEP);
        }
      },
      flush(controller) {
        if (pending !== "") {
          controller.enqueue(encoder.encode(pending));
        }
      },
    }),
  );
  return Promise.resolve(new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}
