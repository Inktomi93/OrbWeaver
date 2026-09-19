//
// The agent-sdk SUMMARIZE role (summarize.ts via the backend's `summarize`), driven by a fake `query`.
// Load-bearing invariants:
//   • mode-1 ONLY — a non-`max-pro-sub` credential fails closed with a typed `invalid` error pointing at
//     the hosted (openrouter) path (v1 scope).
//   • jsonSchema → the SDK `outputFormat:{type:"json_schema",schema}`; the item's `text` = the frame's
//     `structured_output` serialized COMPACT (byte-parity with the vLLM guided-decoding convention, where
//     the JSON rides the completion content string).
//   • no jsonSchema → the plain reply text (trimmed).
//   • the spawn is the FIREWALL BASE (tools disabled, strict MCP, no settings), maxTurns:2, NO resume/
//     sessionStore (a stateless utility turn), and `maxTokens` rides the output-cap env override.
//   • temperature/minP are DROPPED (no sampling on the agent-sdk).
//   • whole-batch-on-first-error: one failed item rejects the whole batch (the vLLM/OR convention).
//   • the per-item watchdog aborts a hung turn (tripped through the backend's injected timer seam).

import type { StructuredRequest, SummarizeRequest, SummarizeResult } from "@orb/server/infra/providers";
import { createAgentSdkBackend, SUMMARIZE_ITEM_TIMEOUT_MS } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { createManualTimer } from "../../../../../support/clock.ts";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { wireSchema } from "../../../../../support/wire-ready.ts";

const MODEL = "claude-haiku-test";
const SESSION_ID = "sess-summarize";

const SUB_CRED = makeResolvedCredential("max-pro-sub");
const VLLM_CRED = makeResolvedCredential("vllm");

const HOSTED_HINT_RE = /openrouter/u;

/** The wired summarize fn (the backend always sets it; the cast drops the contract's `| undefined`). */
type SummarizeFn = (req: SummarizeRequest) => Promise<SummarizeResult>;
type StructuredFn = (req: StructuredRequest) => Promise<SummarizeResult>;

/** `scheduleTimeout` is the backend's injected TIMER seam (the per-item watchdog arms through it). Omitted ⇒
 *  the real timer, which every test but the watchdog one wants. */
function newBackend(
  query: unknown,
  summarizeConcurrency?: () => number,
  scheduleTimeout?: (fn: () => void, ms: number) => () => void,
): ReturnType<typeof createAgentSdkBackend> {
  return createAgentSdkBackend({
    now: () => 0,
    query: query as never,
    refreshHostSubToken: () => Promise.resolve(false),
    ...(summarizeConcurrency !== undefined ? { summarizeConcurrency } : {}),
    ...(scheduleTimeout !== undefined ? { scheduleTimeout } : {}),
  });
}

function backendOf(query: unknown, summarizeConcurrency?: () => number, scheduleTimeout?: (fn: () => void, ms: number) => () => void): SummarizeFn {
  return newBackend(query, summarizeConcurrency, scheduleTimeout).summarize as SummarizeFn;
}

// The `structured` role method (owner ruling 2026-07-27 — the sub's schema-output path; agent-sdk stays out
// of the structured ROLE at the dispatcher, but the backend method exists + is pinned).
function structuredOf(query: unknown): StructuredFn {
  const structured = newBackend(query).structured;
  if (structured === undefined) {
    throw new Error("agent-sdk backend must implement structured");
  }
  return structured as StructuredFn;
}

/** A summarize request over a single (system,user) item — the common prose shape. */
function reqOf(overrides: Partial<SummarizeRequest> = {}): SummarizeRequest {
  return {
    credential: SUB_CRED,
    model: MODEL as SummarizeRequest["model"],
    inputs: [{ systemPrompt: "Summarize tersely.", userPrompt: "The quick brown fox." }],
    ...overrides,
  };
}

/** A structured request over a single item — carries the required `responseFormat`. */
function structReqOf(responseFormat: StructuredRequest["responseFormat"]): StructuredRequest {
  return {
    credential: SUB_CRED,
    model: MODEL as StructuredRequest["model"],
    inputs: [{ systemPrompt: "Extract.", userPrompt: "The quick brown fox." }],
    responseFormat,
  };
}

const initMsg = { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none" };

/** A plain-text success turn (reply text, token usage, cost). */
function textTurn(reply: string): readonly unknown[] {
  return [
    initMsg,
    {
      type: "assistant",
      session_id: SESSION_ID,
      message: { content: [{ type: "text", text: reply }], stop_reason: "end_turn" },
    },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: false,
      total_cost_usd: 0.0003,
      usage: { input_tokens: 12, output_tokens: 5 },
    },
  ];
}

/** A structured-output success turn — the reply text is empty; the JSON rides `structured_output`. */
function structuredTurn(structured: unknown): readonly unknown[] {
  return [
    initMsg,
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: false,
      total_cost_usd: 0.0005,
      usage: { input_tokens: 20, output_tokens: 9 },
      structured_output: structured,
    },
  ];
}

function streamOf(messages: readonly unknown[]): AsyncGenerator<never> {
  async function* gen(): AsyncGenerator<never> {
    await Promise.resolve();
    for (const message of messages) {
      yield message as never;
    }
  }
  return gen();
}

describe("agent-sdk summarize", () => {
  test("no jsonSchema → the plain reply text (trimmed), token usage + sub cost", async () => {
    const fakeQuery = vi.fn((_req: { prompt: string; options: Record<string, unknown> }) => streamOf(textTurn("  a lazy dog jumps  ")));
    const summarize = backendOf(fakeQuery);

    const result = await summarize(reqOf());

    expect(result).toEqual({
      model: MODEL,
      items: [
        {
          text: "a lazy dog jumps",
          usage: { tokensIn: 12, tokensOut: 5, costUsd: 0.0003 },
        },
      ],
    });
    // The spawn is the FIREWALL BASE, maxTurns:2 (the runtime's structured-output retry consumes a
    // turn — probed live 2026-07-10 on sonnet-5), NO resume/sessionStore, plain-string prompt (no images).
    const options = fakeQuery.mock.calls[0]?.[0]?.options ?? {};
    expect(options["tools"]).toEqual([]);
    expect(options["strictMcpConfig"]).toBe(true);
    expect(options["settingSources"]).toEqual([]);
    expect(options["maxTurns"]).toBe(2);
    expect(options["model"]).toBe(MODEL);
    expect(options["systemPrompt"]).toBe("Summarize tersely.");
    expect(options["resume"]).toBeUndefined();
    expect(options["sessionStore"]).toBeUndefined();
    expect(options["outputFormat"]).toBeUndefined();
    expect(fakeQuery.mock.calls[0]?.[0]?.prompt).toBe("The quick brown fox.");
  });

  test("jsonSchema → outputFormat threaded + structured_output serialized COMPACT (vLLM byte-parity)", async () => {
    const schema = wireSchema({
      type: "object",
      properties: { topic: { type: "string" }, sentiment: { type: "string" } },
      required: ["topic", "sentiment"],
    });
    const structured = { topic: "fox", sentiment: "neutral" };
    const fakeQuery = vi.fn((_req: { prompt: string; options: Record<string, unknown> }) => streamOf(structuredTurn(structured)));
    const structuredRun = structuredOf(fakeQuery);

    const result = await structuredRun(structReqOf({ name: "result", schema }));

    // The item text is the COMPACT JSON serialization — exactly what a vLLM guided-decoding completion
    // string would carry (JSON.stringify, no indent), so a consumer can't tell the backends apart.
    expect(result.items[0]?.text).toBe('{"topic":"fox","sentiment":"neutral"}');
    // Byte-parity fixture: re-parsing the item text yields the original structured object.
    expect(JSON.parse(result.items[0]?.text ?? "")).toEqual(structured);
    expect(result.items[0]?.usage).toEqual({ tokensIn: 20, tokensOut: 9, costUsd: 0.0005 });
    // The SDK `outputFormat` carries {type, schema} verbatim.
    const options = fakeQuery.mock.calls[0]?.[0]?.options ?? {};
    expect(options["outputFormat"]).toEqual({ type: "json_schema", schema });
  });

  test("jsonSchema but NO structured_output frame → typed invalid error (never a silent empty string)", async () => {
    // A success result that omits structured_output despite a schema being requested.
    const fakeQuery = vi.fn(() =>
      streamOf([
        initMsg,
        {
          type: "result",
          subtype: "success",
          session_id: SESSION_ID,
          is_error: false,
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      ]),
    );
    const structuredRun = structuredOf(fakeQuery);

    await expect(structuredRun(structReqOf({ name: "result", schema: wireSchema({ type: "object" }) }))).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  test("a non-mode-1 credential → typed invalid error pointing at the hosted (openrouter) path", async () => {
    const fakeQuery = vi.fn(() => streamOf(textTurn("unused")));
    const summarize = backendOf(fakeQuery);

    await expect(summarize(reqOf({ credential: VLLM_CRED }))).rejects.toMatchObject({
      kind: "invalid",
      retryable: false,
      message: expect.stringMatching(HOSTED_HINT_RE),
    });
    // Fail-closed BEFORE any spawn.
    expect(fakeQuery).not.toHaveBeenCalled();
  });

  test("a text-only item keeps the byte-identical plain-string prompt (no images ⇒ no streaming-input)", async () => {
    const fakeQuery = vi.fn((_req: { prompt: unknown; options: Record<string, unknown> }) => streamOf(textTurn("ok")));
    const summarize = backendOf(fakeQuery);

    await summarize(reqOf({ inputs: [{ systemPrompt: "s", userPrompt: "describe" }] }));

    expect(fakeQuery.mock.calls[0]?.[0]?.prompt).toBe("describe");
  });

  test("MA-10: an image-bearing item rides the SDK streaming-input prompt as Anthropic content blocks (pin at doc 05 §IC-B LIFTED)", async () => {
    const fakeQuery = vi.fn((_req: { prompt: unknown; options: Record<string, unknown> }) => streamOf(textTurn("ok")));
    const summarize = backendOf(fakeQuery);

    await summarize(reqOf({ inputs: [{ systemPrompt: "s", userPrompt: "describe", images: [Uint8Array.from([1, 2, 3]), "https://cdn.example/a.jpg"] }] }));

    // The prompt is now an AsyncIterable<SDKUserMessage> — drain it and assert the single user message carries
    // the text block first, then a base64 (bytes) + url (string) image block in order (the default passthrough
    // normalizer labels bytes png → base64 "AQID").
    const prompt = fakeQuery.mock.calls[0]?.[0]?.prompt as AsyncIterable<{ type: string; message: { role: string; content: unknown } }>;
    expect(typeof prompt).toBe("object");
    const messages: { type: string; message: { role: string; content: unknown } }[] = [];
    for await (const m of prompt) {
      messages.push(m);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("user");
    expect(messages[0]?.message).toEqual({
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
        { type: "image", source: { type: "url", url: "https://cdn.example/a.jpg" } },
      ],
    });
    // The system prompt still rides the option, not the streamed message.
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.["systemPrompt"]).toBe("s");
  });

  test("maxTokens rides the output-cap env override; sampling knobs are DROPPED", async () => {
    const fakeQuery = vi.fn((_req: { prompt: string; options: Record<string, unknown> }) => streamOf(textTurn("ok")));
    const summarize = backendOf(fakeQuery);

    await summarize(
      reqOf({
        maxTokens: 256,
        temperature: 0.9,
        minP: 0.05,
      }),
    );

    const options = fakeQuery.mock.calls[0]?.[0]?.options ?? {};
    const env = (options["env"] ?? {}) as Record<string, string | undefined>;
    // maxTokens → CLAUDE_CODE_MAX_OUTPUT_TOKENS (the one honored knob).
    expect(env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("256");
    // No sampling knobs reach the SDK options (the agent-sdk exposes none).
    expect(options).not.toHaveProperty("temperature");
    expect(options).not.toHaveProperty("minP");
  });

  test("a batch summarizes every input, index-aligned, one turn per item", async () => {
    const replies = ["first summary", "second summary", "third summary"];
    let call = 0;
    const fakeQuery = vi.fn(() => {
      const reply = replies[call] ?? "?";
      call += 1;
      return streamOf(textTurn(reply));
    });
    const summarize = backendOf(fakeQuery);

    const result = await summarize(
      reqOf({
        inputs: replies.map((_r, i) => ({
          systemPrompt: "s",
          userPrompt: `input ${i}`,
        })),
      }),
    );

    expect(result.items.map((it) => it.text)).toEqual(replies);
    expect(fakeQuery).toHaveBeenCalledTimes(3);
  });

  // Q6 (stint-6 item 1): the worker COUNT is the injected agentSdkConcurrency.summarize getter, not a const.
  // A concurrency of 2 over 5 items must never run more than 2 turns at once (peak in-flight ≤ 2). Each item's
  // turn yields across a microtask so the pool genuinely overlaps — a serial run would peak at 1.
  test("caps in-flight summarize turns at the injected concurrency getter (Q6 — was a hardcoded 4)", async () => {
    let inFlight = 0;
    let peak = 0;
    const fakeQuery = vi.fn(() =>
      (async function* gated(): AsyncGenerator<unknown> {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        // A couple of microtask hops so concurrently-started workers overlap before any completes.
        await Promise.resolve();
        await Promise.resolve();
        inFlight -= 1;
        yield* textTurn("ok");
      })(),
    );
    const summarize = backendOf(fakeQuery, () => 2);
    const inputs = Array.from({ length: 5 }, (_v, i) => ({ systemPrompt: "s", userPrompt: `input ${i}` }));
    await summarize(reqOf({ inputs }));
    expect(peak).toBe(2); // exactly the injected concurrency — never the former hardcoded 4, never serial 1.
    expect(fakeQuery).toHaveBeenCalledTimes(5);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 33])("rejects an invalid or oversized worker count (%s) before spawning", async (value) => {
    const fakeQuery = vi.fn(() => streamOf(textTurn("should not run")));
    const summarize = backendOf(fakeQuery, () => value);
    await expect(summarize(reqOf())).rejects.toMatchObject({ kind: "invalid" });
    expect(fakeQuery).not.toHaveBeenCalled();
  });

  test("whole-batch-on-first-error: one failed item rejects the entire batch (vLLM/OR convention)", async () => {
    const fakeQuery = vi.fn((args: { prompt: string }) => {
      // The second item's turn fails (a non-success result subtype).
      if (args.prompt === "input 1") {
        return streamOf([
          initMsg,
          {
            type: "result",
            subtype: "error_during_execution",
            session_id: SESSION_ID,
            is_error: true,
            total_cost_usd: 0,
            usage: { input_tokens: 0, output_tokens: 0 },
            terminal_reason: "model_error",
          },
        ]);
      }
      return streamOf(textTurn("ok"));
    });
    const summarize = backendOf(fakeQuery);

    await expect(
      summarize(
        reqOf({
          inputs: [
            { systemPrompt: "s", userPrompt: "input 0" },
            { systemPrompt: "s", userPrompt: "input 1" },
          ],
        }),
      ),
    ).rejects.toMatchObject({ kind: "server" });
  });

  test("the per-item watchdog aborts a hung turn and fails the batch", async () => {
    // A stream that never yields a result frame — the reduce would hang without the watchdog.
    const hung = (): AsyncGenerator<never> => {
      async function* gen(): AsyncGenerator<never> {
        await new Promise(() => {
          // never resolves
        });
      }
      return gen();
    };
    const fakeQuery = vi.fn(() => hung());
    // The watchdog arms through the backend's INJECTED `scheduleTimeout` (Spine-Testing.md §3) — tripped by
    // hand here, asserting the REAL bound was armed rather than any amount of elapsed time.
    const timer = createManualTimer();
    const summarize = backendOf(fakeQuery, undefined, timer.schedule);

    const pending = summarize(reqOf());
    const assertion = expect(pending).rejects.toMatchObject({ kind: "server" });
    await vi.waitFor(() => expect(timer.armed()).toEqual([SUMMARIZE_ITEM_TIMEOUT_MS]));
    timer.fire(); // cross the watchdog — it aborts the spawn and rejects
    await assertion;
  });
});
