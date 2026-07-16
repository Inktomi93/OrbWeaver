// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use the SDK's snake_case
// wire fields (session_id, total_cost_usd, is_error, structured_output, input_tokens, …).
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
//   • temperature/minP/repetitionDetection are DROPPED (no sampling on the agent-sdk).
//   • whole-batch-on-first-error: one failed item rejects the whole batch (the vLLM/OR convention).
//   • the per-item watchdog aborts a hung turn (fake timers).

import type { SummarizeRequest, SummarizeResult } from "@orb/server/infra/providers";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "claude-haiku-test";
const SESSION_ID = "sess-summarize";

const SUB_CRED = makeResolvedCredential("max-pro-sub");
const VLLM_CRED = makeResolvedCredential("vllm");

const HOSTED_HINT_RE = /openrouter/u;

/** The wired summarize fn (the backend always sets it; the cast drops the contract's `| undefined`). */
type SummarizeFn = (req: SummarizeRequest) => Promise<SummarizeResult>;

function backendOf(query: unknown): SummarizeFn {
  const backend = createAgentSdkBackend({
    now: () => 0,
    query: query as never,
    refreshHostSubToken: () => Promise.resolve(false),
  });
  return backend.summarize as SummarizeFn;
}

/** A request over a single (system,user) item — the common shape. */
function reqOf(overrides: Partial<SummarizeRequest> = {}): SummarizeRequest {
  return {
    credential: SUB_CRED,
    model: MODEL as SummarizeRequest["model"],
    inputs: [{ systemPrompt: "Summarize tersely.", userPrompt: "The quick brown fox." }],
    ...overrides,
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
    const schema = {
      type: "object",
      properties: { topic: { type: "string" }, sentiment: { type: "string" } },
      required: ["topic", "sentiment"],
    };
    const structured = { topic: "fox", sentiment: "neutral" };
    const fakeQuery = vi.fn((_req: { prompt: string; options: Record<string, unknown> }) => streamOf(structuredTurn(structured)));
    const summarize = backendOf(fakeQuery);

    const result = await summarize(reqOf({ jsonSchema: schema }));

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
    const summarize = backendOf(fakeQuery);

    await expect(summarize(reqOf({ jsonSchema: { type: "object" } }))).rejects.toMatchObject({
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

  test("maxTokens rides the output-cap env override; sampling knobs are DROPPED", async () => {
    const fakeQuery = vi.fn((_req: { prompt: string; options: Record<string, unknown> }) => streamOf(textTurn("ok")));
    const summarize = backendOf(fakeQuery);

    await summarize(
      reqOf({
        maxTokens: 256,
        temperature: 0.9,
        minP: 0.05,
        repetitionDetection: { maxPatternSize: 4, minCount: 3 },
      }),
    );

    const options = fakeQuery.mock.calls[0]?.[0]?.options ?? {};
    const env = (options["env"] ?? {}) as Record<string, string | undefined>;
    // maxTokens → CLAUDE_CODE_MAX_OUTPUT_TOKENS (the one honored knob).
    expect(env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("256");
    // No sampling knobs reach the SDK options (the agent-sdk exposes none).
    expect(options).not.toHaveProperty("temperature");
    expect(options).not.toHaveProperty("minP");
    expect(options).not.toHaveProperty("repetitionDetection");
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
    vi.useFakeTimers();
    try {
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
      const summarize = backendOf(fakeQuery);

      const pending = summarize(reqOf());
      const assertion = expect(pending).rejects.toMatchObject({ kind: "server" });
      // Advance past the 120s watchdog — it aborts the spawn and rejects.
      await vi.advanceTimersByTimeAsync(120_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
