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
//
// Framing follows the SSE spec, not one vendor: the frame separator is `\n\n` OR `\r\n\r\n`, the space
// after `data:` is optional, and lines ending in CR are read with the CR (pinned by the no-space and
// CRLF arms of `tests/inference/backends/openai-compat/responses-turn.int.test.ts`).

import type { JsonValue } from "@orb/kit/json";
import { parseJsonText } from "@orb/kit/json";

const DATA_PREFIX = "data:";
const EVENT_PREFIX = "event:";
const DELTA = "response.reasoning_text.delta";
const DONE = "response.reasoning_text.done";
const SUMMARY_DELTA = "response.reasoning_summary_text.delta";
const SUMMARY_PART_DONE = "response.reasoning_summary_part.done";
/** No frame legitimately reaches a megabyte; past this the buffer stops accumulating and bytes pass
 *  through unframed (byte-identical), so a stream that never frames cannot grow the buffer without
 *  bound. The SDK's own parser re-buffers as usual — only the FOLD is skipped for such a stream. */
const PENDING_CAP_BYTES = 1_048_576;

/** The next frame boundary per the SSE spec: `\r\n\r\n` or `\n\n`, whichever comes first (a `\n\n`
 *  inside a CRLF separator is the same boundary, not an earlier one). */
function boundaryOf(pending: string): { readonly index: number; readonly separator: string } | undefined {
  const crlf = pending.indexOf("\r\n\r\n");
  const lf = pending.indexOf("\n\n");
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return { index: crlf, separator: "\r\n\r\n" };
  }
  if (lf !== -1) {
    return { index: lf, separator: "\n\n" };
  }
  return undefined;
}

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

/** Rewrite one SSE frame from the raw-reasoning spelling onto the summary spelling; `undefined` keeps
 *  the frame as-is. CR line endings are read with the CR; a frame whose data line is replaced is
 *  rewritten with the canonical `data: ` spacing, which every conformant parser (the SDK included) reads. */
function rewriteFrame(frame: string): string | undefined {
  const lines = frame.split("\n");
  const dataIndex = lines.findIndex((line) => line.startsWith(DATA_PREFIX));
  if (dataIndex === -1) {
    return undefined;
  }
  // Multi-line `data:` accumulation is a frame we do not name: rewriting only the first line would
  // corrupt it, so it rides untouched.
  if (lines.some((line, index) => index !== dataIndex && line.startsWith(DATA_PREFIX))) {
    return undefined;
  }
  const dataLine = lines[dataIndex];
  if (dataLine === undefined) {
    return undefined;
  }
  const data = parseJsonText(dataLine.slice(DATA_PREFIX.length).trim());
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  const fold = foldOf(data);
  if (fold === undefined) {
    return undefined;
  }
  return lines.map((line) => refoldLine(line, fold)).join("\n");
}

/** One line of a folded frame: the `data:`/`event:` lines point at the rewritten payload, every other
 *  line (and CR, on CRLF streams) rides. */
function refoldLine(line: string, fold: Fold): string {
  if (line.startsWith(DATA_PREFIX)) {
    return `${DATA_PREFIX} ${JSON.stringify(fold.payload)}`;
  }
  if (line.startsWith(EVENT_PREFIX)) {
    return `${EVENT_PREFIX} ${fold.summaryType}`;
  }
  return line;
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
        let boundary = boundaryOf(pending);
        while (boundary !== undefined) {
          const frame = pending.slice(0, boundary.index);
          const rest = pending.slice(boundary.index + boundary.separator.length);
          const rewritten = rewriteFrame(frame);
          controller.enqueue(encoder.encode(`${rewritten ?? frame}${boundary.separator}`));
          pending = rest;
          boundary = boundaryOf(pending);
        }
        if (pending.length > PENDING_CAP_BYTES) {
          controller.enqueue(encoder.encode(pending));
          pending = "";
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
