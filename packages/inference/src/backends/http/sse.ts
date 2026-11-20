// The OpenAI-dialect SSE framing — the ONE place a `data:` stream is split. Two shapes over one buffer limit:
// `parseOpenAiSse` READS a stream into JSON events (`wrapFetch` reshapes each chunk through a connection's
// `transport.responseMap` BEFORE the SDK parses it, and reshaping needs the chunks as objects), and
// `sseFrameTransform` REWRITES chosen frames of a stream the SDK still parses itself, every other frame passing
// through as sent, so a frame the rewriter does not name keeps the exact error or event it would have raised.
// A malformed RESULT-BEARING `data:` line is a protocol error the reader's caller must see — silently dropping
// it let a reducer return an empty turn as a SUCCESS; blank lines, comments and non-data fields stay skippable.
// Past the limit the reader refuses and the transform forwards the tail unframed, on purpose: a `/responses`
// terminal frame carries the whole reply, so a max-length turn can outgrow the limit in its last frame, and
// refusing there would fail a complete turn; the SDK downstream frames those bytes itself.

const SSE_DATA_PREFIX = "data:";
const SSE_DONE = "[DONE]";
const SSE_BUFFER_LIMIT = 1_048_576;
const SSE_ERROR_PAYLOAD_PREVIEW = 200;

function truncateSsePayload(payload: string): string {
  return payload.length > SSE_ERROR_PAYLOAD_PREVIEW ? `${payload.slice(0, SSE_ERROR_PAYLOAD_PREVIEW)}…` : payload;
}

type SseLine = { readonly kind: "data"; readonly value: unknown } | { readonly kind: "done" | "skip" };

/** The payload of a `data:` line, trimmed (the space after the colon is optional and a CRLF line keeps its CR),
 *  or `undefined` for any other line. */
export function sseDataPayload(line: string): string | undefined {
  return line.startsWith(SSE_DATA_PREFIX) ? line.slice(SSE_DATA_PREFIX.length).trim() : undefined;
}

function parseSseLine(line: string): SseLine {
  const payload = sseDataPayload(line);
  if (payload === undefined) {
    return { kind: "skip" };
  }
  if (payload === SSE_DONE) {
    return { kind: "done" };
  }
  try {
    return { kind: "data", value: JSON.parse(payload) };
  } catch (cause) {
    throw new Error(`OpenAI-compatible SSE data payload was not valid JSON: ${truncateSsePayload(payload)}`, { cause });
  }
}

function assertSseLineBound(line: string): void {
  if (line.length > SSE_BUFFER_LIMIT) {
    throw new Error(`OpenAI-compatible SSE line exceeded the ${SSE_BUFFER_LIMIT}-character limit`);
  }
}

function decodeSseChunk(buffer: string, value: Uint8Array, decoder: TextDecoder): { buffer: string; lines: string[] } {
  const lines: string[] = [];
  let offset = 0;
  let pending = buffer;
  while (offset < value.byteLength) {
    const take = Math.min(value.byteLength - offset, SSE_BUFFER_LIMIT - pending.length + 1);
    pending += decoder.decode(value.subarray(offset, offset + take), { stream: true });
    offset += take;
    const complete = pending.split("\n");
    pending = complete.pop() ?? "";
    for (const line of complete) {
      assertSseLineBound(line);
      lines.push(line.trim());
    }
    assertSseLineBound(pending);
  }
  return { buffer: pending, lines };
}

/** Every `data:` JSON payload of an SSE body, in order; stops at `[DONE]`. A final line the server never
 *  newline-terminated (spec-sloppy endpoints) is flushed at EOF. */
export async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = parseSseLine(buffer.trim());
        if (tail.kind === "data") {
          yield tail.value;
        }
        break;
      }
      const decoded = decodeSseChunk(buffer, value, decoder);
      buffer = decoded.buffer;
      for (const line of decoded.lines) {
        const parsed = parseSseLine(line);
        if (parsed.kind === "done") {
          return;
        }
        if (parsed.kind === "data") {
          yield parsed.value;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Re-serialize one reshaped event as an SSE `data:` line — the inverse `wrapFetch` uses to hand the SDK a
 *  stream it can parse after `responseMap` ran. */
export function encodeSseData(value: unknown): string {
  return `${SSE_DATA_PREFIX} ${JSON.stringify(value)}\n\n`;
}

export const SSE_DONE_LINE = `${SSE_DATA_PREFIX} ${SSE_DONE}\n\n`;

const SSE_SEPARATORS = ["\r\n\r\n", "\n\n"] as const;

/** The next frame boundary: `\r\n\r\n` or `\n\n`, whichever starts first (the `\n\n` inside a CRLF separator
 *  is that boundary, not an earlier one). */
function frameBoundaryOf(pending: string): { readonly index: number; readonly separator: string } | undefined {
  let found: { readonly index: number; readonly separator: string } | undefined;
  for (const separator of SSE_SEPARATORS) {
    const index = pending.indexOf(separator);
    if (index !== -1 && (found === undefined || index < found.index)) {
      found = { index, separator };
    }
  }
  return found;
}

/** A byte-stream transform over SSE frames, for a reply translator that rewrites some frames and passes the rest
 *  through. `rewrite` receives one frame without its separator and returns its replacement INCLUDING the
 *  terminator (end the data line with {@link encodeSseData}), or `undefined` to forward the frame and its
 *  separator as sent. Frames split across network chunks are buffered up to the reader's limit. */
export function sseFrameTransform(rewrite: (frame: string) => string | undefined): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller): void {
      pending += decoder.decode(chunk, { stream: true });
      let boundary = frameBoundaryOf(pending);
      while (boundary !== undefined) {
        const frame = pending.slice(0, boundary.index);
        controller.enqueue(encoder.encode(rewrite(frame) ?? `${frame}${boundary.separator}`));
        pending = pending.slice(boundary.index + boundary.separator.length);
        boundary = frameBoundaryOf(pending);
      }
      if (pending.length > SSE_BUFFER_LIMIT) {
        controller.enqueue(encoder.encode(pending));
        pending = "";
      }
    },
    flush(controller): void {
      pending += decoder.decode();
      if (pending !== "") {
        controller.enqueue(encoder.encode(pending));
      }
    },
  });
}
