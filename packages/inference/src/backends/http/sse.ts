// The OpenAI-dialect SSE line parser — the ONE place a `data:` stream is split into JSON events. It survives
// the SDK cut-over for one job: `wrapFetch` on the `openai-compatible` transport reshapes each chunk through a
// connection's `transport.responseMap` BEFORE the SDK parses it, and reshaping needs the chunks as objects.
// A malformed RESULT-BEARING `data:` line is a protocol error the caller must see (#758) — silently dropping
// it let a reducer return an empty turn as a SUCCESS; blank lines, comments and non-data fields stay skippable.

const SSE_DATA_PREFIX = "data:";
const SSE_DONE = "[DONE]";
const SSE_BUFFER_LIMIT = 1_048_576;
const SSE_ERROR_PAYLOAD_PREVIEW = 200;

function truncateSsePayload(payload: string): string {
  return payload.length > SSE_ERROR_PAYLOAD_PREVIEW ? `${payload.slice(0, SSE_ERROR_PAYLOAD_PREVIEW)}…` : payload;
}

type SseLine = { readonly kind: "data"; readonly value: unknown } | { readonly kind: "done" | "skip" };

function parseSseLine(line: string): SseLine {
  if (!line.startsWith(SSE_DATA_PREFIX)) {
    return { kind: "skip" };
  }
  const payload = line.slice(SSE_DATA_PREFIX.length).trim();
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
export async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
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
