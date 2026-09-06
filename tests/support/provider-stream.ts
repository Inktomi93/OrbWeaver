// The chat-completions TERMINAL FRAME every completed stream ends with (#1400: every reducer refuses a
// stream that closes without one — `chunk.choices[0].finishReason` is the ONLY field that marks a
// generation COMPLETE). #1547 found two stale fixtures only by RUNNING all 13 candidate suites — a grep
// for the literal read one of them as terminal-bearing because its `finish_reason` sat in `choices[1]`, a
// position no reader looks at (`tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts`'s header
// has the full story). Every raw stream fixture composes its terminal frame from HERE instead of
// hand-spelling the JSON, so a fixture cannot go terminal-less (or mis-placed) by construction.
//
// Composed as template strings, never a typed object literal — the wire's snake_case field names
// (`finish_reason`, `prompt_tokens`, `completion_tokens`) would otherwise need a naming-convention
// suppression at every call site.

export interface TerminalFrameOptions {
  /** Defaults to `"stop"`; pass `"tool_calls"` / `"length"` / etc for a fixture pinning a specific reason. */
  readonly finishReason?: string;
  /** A delta to merge into the SAME choice as the terminal (a provider whose last content chunk also
   *  carries the finish reason, rather than trailing it with a separate empty-delta chunk). Pass `{}` for
   *  an explicit empty delta on the terminal chunk. */
  readonly delta?: Record<string, unknown>;
  readonly usage?: { readonly promptTokens: number; readonly completionTokens: number };
}

const DEFAULT_FINISH_REASON = "stop";

/** The terminal chunk's bare JSON payload (no SSE framing) — vLLM's NDJSON-per-line fixtures
 *  (`sseStream`/`streamingClient`) pass this straight through as one of their raw payload strings. */
export function terminalChunkJson(opts: TerminalFrameOptions = {}): string {
  const finishReason = opts.finishReason ?? DEFAULT_FINISH_REASON;
  const deltaField = opts.delta === undefined ? "" : `"delta":${JSON.stringify(opts.delta)},`;
  const choice = `{${deltaField}"finish_reason":${JSON.stringify(finishReason)}}`;
  const usageField = opts.usage === undefined ? "" : `,"usage":{"prompt_tokens":${opts.usage.promptTokens},"completion_tokens":${opts.usage.completionTokens}}`;
  return `{"choices":[${choice}]${usageField}}`;
}

/** The `data: `-framed terminal line — SSE-speaking fixtures (custom-byo, the wire-capture-fidelity int
 *  test, the entry-compose rpg tool-round fixture) build their canned stream with this. */
export function terminalSseLine(opts: TerminalFrameOptions = {}): string {
  return `data: ${terminalChunkJson(opts)}`;
}
