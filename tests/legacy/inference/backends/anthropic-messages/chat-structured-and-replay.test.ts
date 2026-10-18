// backends/anthropic-messages/chat — the structured plan on the direct wire, the thinking budget beside the visible cap, and completed historical tool replay.

// @orb-waive-file no-test-fabrication({ readonly format: { readonly type: string; readonly schema: Record<string, unknown> } }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ readonly type: string; readonly budget_tokens: number }): baselined when the gate widened to value casts; burn-down item 906.
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { wireSchema } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { anthropicTextStream, scriptedSseFetch } from "../_hosted-support.ts";
import { BUDGET, curatedConnection, deps, ProviderError, recordedTurn, runAnthropicChatTurn, SIGNATURE, THINKING, turnRequest } from "./_chat-support.ts";

// ── the structured plan on the direct Anthropic chat wire ────────────────────────────────────────────────────

test("a response format rides output_config.format with the SDK pinned to it — the SDK never picks a vehicle itself", async () => {
  const responseFormat = {
    name: "row",
    schema: wireSchema({ type: "object", properties: { tags: { type: "array", items: { type: "string" }, minItems: 3 } }, required: ["tags"] }),
  };
  const { body } = await recordedTurn(
    turnRequest({ connection: curatedConnection("claude-sonnet-5-5"), tools: undefined, responseFormat }),
    anthropicTextStream('{"tags":["a"]}'),
  );
  const format = (body?.body["output_config"] as { readonly format: { readonly type: string; readonly schema: Record<string, unknown> } })?.format;
  if (format === undefined) {
    throw new Error("the structured request carried no output_config.format");
  }
  expect(format.type).toBe("json_schema");
  // The anthropic-format scrub rode: the author's floor is clamped to the subset's 1 and relayed as the note. The
  // SDK's own `sanitizeJsonSchema` would strip that `minItems: 1` too; the planned schema is put back after it.
  // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
  expect((format.schema["properties"] as Record<string, unknown>)["tags"]).toEqual({
    type: "array",
    items: { type: "string" },
    minItems: 1,
    description: "[Constraints: minItems: 3]",
  });
  expect(body?.body).not.toHaveProperty("tools");
});

test("an over-limit schema on the direct wire with no tool to fall back to is a ProviderError with violations before fetch", async () => {
  const connection = curatedConnection("claude-sonnet-5-5");
  if (connection.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const { tools: _tools, ...generation } = connection.capability.generation;
  const responseFormat = {
    name: "wide",
    schema: wireSchema({
      type: "object",
      properties: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${String(i)}`, { type: "string" }])),
      required: [],
    }),
  };
  const recorded: RecordedRequest[] = [];
  const failure = await runAnthropicChatTurn(
    turnRequest({ connection: { ...connection, capability: { kind: "generation", generation } }, tools: undefined, responseFormat }),
    deps(scriptedSseFetch([anthropicTextStream("{}")], recorded)),
  ).catch((err: unknown) => err);
  expect(recorded).toEqual([]);
  expect(failure).toBeInstanceOf(ProviderError);
  expect(failure).toMatchObject({ kind: "invalid", detail: "schema_rejected", violations: [{ kind: "optional-props", count: 30, limit: 24 }] });
});

// The SDK adds an `enabled` budget to `max_tokens` on this wire, so the budget sits beside the visible cap rather
// than inside it: the funnel sizes it against what the model's own cap leaves, and counts it once.
test("a budget-mode chat turn counts its thinking budget once: beside the visible cap, never squeezed inside it", async () => {
  const visible = 4096;
  const { body } = await recordedTurn(
    turnRequest({ connection: curatedConnection("claude-haiku-4-5"), tools: undefined, params: { effort: "high", maxOutputTokens: visible } }),
    anthropicTextStream("ok"),
  );
  const thinking = body?.body["thinking"] as { readonly type: string; readonly budget_tokens: number };
  expect(thinking.type).toBe("enabled");
  expect(thinking.budget_tokens).toBe(BUDGET.budget_tokens);
  expect(body?.body["max_tokens"]).toBe(visible + BUDGET.budget_tokens);
});

for (const carryReasoning of ["off", "tool-chain", "conversation"] as const) {
  test(`completed historical tool replay preserves native Anthropic blocks with carry ${carryReasoning}`, async () => {
    for (const model of ["claude-sonnet-4-5", "claude-opus-5"]) {
      const reasoning =
        carryReasoning === "conversation" ? [{ type: "reasoning" as const, text: THINKING, meta: { anthropic: { signature: SIGNATURE } } }] : [];
      const { body } = await recordedTurn(
        turnRequest({
          connection: curatedConnection(model),
          params: { effort: "high", carryReasoning },
          history: [
            { role: "user", content: [{ type: "text", text: "Check Paris." }] },
            {
              role: "assistant",
              content: [
                ...reasoning,
                { type: "text", text: "Before." },
                { type: "tool-call", toolCallId: "toolu_past", name: "get_weather", arguments: '{"city":"Paris"}' },
              ],
            },
            { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_past", content: "18C, clear." }] },
            { role: "assistant", content: [{ type: "text", text: "After." }] },
            { role: "user", content: [{ type: "text", text: "Explain the result." }] },
          ],
        }),
        anthropicTextStream("Understood."),
      );
      expect(body?.body["messages"], model).toMatchObject([
        { role: "user", content: [{ type: "text", text: "Check Paris." }] },
        {
          role: "assistant",
          content: [
            ...(carryReasoning === "conversation" ? [{ type: "thinking", thinking: THINKING, signature: SIGNATURE }] : []),
            { type: "text", text: "Before." },
            { type: "tool_use", id: "toolu_past", name: "get_weather", input: { city: "Paris" } },
          ],
        },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_past", content: "18C, clear." }] },
        { role: "assistant", content: [{ type: "text", text: "After." }] },
        { role: "user", content: [{ type: "text", text: "Explain the result." }] },
      ]);
    }
  });
}
