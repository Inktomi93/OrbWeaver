// backends/v4/prompt — the assembled history → the shared V4 prompt (`buildWirePlan`). Under test:
//   • the A1 reasoning-part emission — a replayed `reasoning` content part becomes a V4 `reasoning` message
//     part with PART-LEVEL `providerOptions` keyed per wire (`anthropic` / `openrouter`), never a message-
//     level option, and a bare-text reasoning row with no provenance carries no `providerOptions` at all;
//   • E4's documented "intentional" arm — `toolInput` on malformed JSON rides the RAW STRING through, which
//     the converter then re-stringifies (double-encoded); pinned here so a future "fix" is a visible diff;
//   • the system prompt: static + dynamic joined in the leading system region, or split with `splitSystem`;
//   • `endsOnAssistant` / `toolResultErrorDropped` (A2's prefill-belt inputs) and the assistant-media /
//     participant-name side maps `body.ts` re-attaches from (§8.0).
//
// Nothing before this file drove `buildWirePlan` directly — the two hosted `chat.test.ts` suites only see
// its OUTPUT through the SDK's own converter, several layers downstream.

import { buildWirePlan, mediaFilePart } from "../../../../packages/inference/src/backends/v4/prompt.ts";
import type { ChatHistoryMessage } from "../../../../packages/inference/src/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";

function userRow(text: string): ChatHistoryMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

test("static + dynamic join into ONE leading system row", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "You are helpful.", dynamic: "Time: noon." },
    history: [userRow("hi")],
  });
  expect(plan.prompt[0]).toEqual({ role: "system", content: "You are helpful.\n\nTime: noon." });
  expect(plan.prompt).toHaveLength(2);
});

test("splitSystem: static and dynamic ride as TWO leading system rows (the OR/Anthropic cache split)", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "You are helpful.", dynamic: "Time: noon." },
    splitSystem: true,
    history: [userRow("hi")],
  });
  expect(plan.prompt[0]).toEqual({ role: "system", content: "You are helpful." });
  expect(plan.prompt[1]).toEqual({ role: "system", content: "Time: noon." });
  expect(plan.prompt).toHaveLength(3);
});

test("the dynamic half never moves below the history: the array still ends on the history's last row", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "You are helpful.", dynamic: "Time: noon." },
    splitSystem: true,
    history: [userRow("hi")],
  });
  expect(plan.prompt.at(-1)).toEqual({ role: "user", content: [{ type: "text", text: "hi" }] });
  expect(plan.prompt.filter((m) => m.role === "system")).toHaveLength(2);
});

test("an empty dynamic half emits no system row at all — never a blank string riding the wire", () => {
  const plan = buildWirePlan({ systemPrompt: { static: "", dynamic: "" }, history: [userRow("hi")] });
  expect(plan.prompt).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
});

// ── A1: the reasoning part → part-level providerOptions ──────────────────────────────────────────────────

test("A1: a replayed reasoning part with anthropic provenance becomes a reasoning MESSAGE PART with its OWN providerOptions", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      userRow("What's the weather?"),
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Thinking about it", meta: { anthropic: { signature: "sig-1" } } },
          { type: "tool-call", toolCallId: "c1", name: "get_weather", arguments: "{}" },
        ],
      },
    ],
  });
  const assistant = plan.prompt.find((m) => m.role === "assistant");
  expect(assistant?.content).toEqual([
    { type: "reasoning", text: "Thinking about it", providerOptions: { anthropic: { signature: "sig-1" } } },
    { type: "tool-call", toolCallId: "c1", toolName: "get_weather", input: {} },
  ]);
  // The MESSAGE-level options carry nothing — the reasoning provenance is PART-scoped, never message-scoped.
  expect(assistant?.providerOptions).toBeUndefined();
});

test("A1: openrouter reasoningDetails ride under the wire's snake_case key, and BOTH provenances ride together when both are known", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      userRow("hi"),
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "thinking",
            meta: { anthropic: { signature: "sig-1" }, openrouter: { reasoningDetails: [{ type: "reasoning.text", signature: "sig-1" }] } },
          },
          { type: "text", text: "an answer" },
        ],
      },
    ],
  });
  const assistant = plan.prompt.find((m) => m.role === "assistant");
  expect(assistant?.content[0]).toEqual({
    type: "reasoning",
    text: "thinking",
    providerOptions: { anthropic: { signature: "sig-1" }, openrouter: { reasoning_details: [{ type: "reasoning.text", signature: "sig-1" }] } },
  });
});

test("a reasoning part with NO meta at all carries no providerOptions field — never an empty object", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      userRow("hi"),
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "bare" },
          { type: "text", text: "answer" },
        ],
      },
    ],
  });
  const assistant = plan.prompt.find((m) => m.role === "assistant");
  const reasoningPart = assistant?.content.find((p: { type: string }) => p.type === "reasoning");
  expect(reasoningPart).toEqual({ type: "reasoning", text: "bare" });
  expect(reasoningPart && "providerOptions" in reasoningPart).toBe(false);
});

test("a row carrying ONLY replayed reasoning (no text, no tool-call, no media) is dropped — not a turn", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("hi"), { role: "assistant", content: [{ type: "reasoning", text: "thinking", meta: { anthropic: { signature: "s" } } }] }],
  });
  expect(plan.prompt.some((m) => m.role === "assistant")).toBe(false);
});

// ── E4: malformed tool-call JSON rides the RAW STRING (documented, intentional) ──────────────────────────

test("E4: a malformed tool-call arguments string is NOT dropped or thrown on — it rides as the raw string", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("hi"), { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", name: "f", arguments: "{not json" }] }],
  });
  const assistant = plan.prompt.find((m) => m.role === "assistant");
  expect(assistant?.content).toEqual([{ type: "tool-call", toolCallId: "c1", toolName: "f", input: "{not json" }]);
});

test("well-formed tool-call arguments parse to a real object input", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("hi"), { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", name: "f", arguments: '{"a":1}' }] }],
  });
  const assistant = plan.prompt.find((m) => m.role === "assistant");
  expect(assistant?.content).toEqual([{ type: "tool-call", toolCallId: "c1", toolName: "f", input: { a: 1 } }]);
});

// ── §8.0: assistant media / participant names / tool fan-out / error flattening ────────────────────────

test("an assistant row's media is recorded on the plan (dropped by the converter) with the row's WIRE INDEX", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      userRow("draw a cat"),
      {
        role: "assistant",
        content: [
          { type: "text", text: "here" },
          { type: "image", url: "https://x/cat.png" },
        ],
      },
    ],
  });
  const index = plan.prompt.findIndex((m) => m.role === "assistant");
  expect(plan.assistantMedia.get(index)).toEqual([{ kind: "image", url: "https://x/cat.png" }]);
});

test("a row's `name` is recorded per wire index for user/assistant rows only", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      { role: "user", content: [{ type: "text", text: "hi" }], name: "Alice" },
      { role: "assistant", content: [{ type: "text", text: "hello" }], name: "Bot" },
    ],
  });
  expect(plan.names.get(0)).toBe("Alice");
  expect(plan.names.get(1)).toBe("Bot");
});

test("a `tool` history row fans out to one wire message PER tool-result part, isError recorded on the plan row", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", content: "ok" },
          { type: "tool-result", toolCallId: "c2", content: "boom", isError: true },
        ],
      },
    ],
  });
  expect(plan.prompt).toHaveLength(2);
  expect(plan.prompt[0]).toMatchObject({ role: "tool", content: [{ type: "tool-result", toolCallId: "c1", output: { type: "text", value: "ok" } }] });
  expect(plan.prompt[1]).toMatchObject({ role: "tool", content: [{ type: "tool-result", toolCallId: "c2", output: { type: "error-text", value: "boom" } }] });
  expect(plan.toolResultErrorDropped).toBe(true);
});

// OpenRouter forwards a tool result's `toolName` as the wire message's `name`, and Google refuses an empty one
// ("Tool message must have either name or tool_call_id"), so every Gemini tool follow-up 400ed.
test("a tool result carries the name of the call it answers", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [
      userRow("weather in Paris and Oslo?"),
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", name: "get_weather", arguments: '{"city":"Paris"}' },
          { type: "tool-call", toolCallId: "c2", name: "get_forecast", arguments: '{"city":"Oslo"}' },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c2", content: "rain" },
          { type: "tool-result", toolCallId: "c1", content: "sun" },
        ],
      },
    ],
  });
  const results = plan.prompt.filter((message) => message.role === "tool").flatMap((message) => message.content);
  expect(results).toMatchObject([
    { type: "tool-result", toolCallId: "c2", toolName: "get_forecast" },
    { type: "tool-result", toolCallId: "c1", toolName: "get_weather" },
  ]);
});

test("toolResultErrorDropped is false when no history tool-result ever carried isError", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [{ role: "tool", content: [{ type: "tool-result", toolCallId: "c1", content: "ok" }] }],
  });
  expect(plan.toolResultErrorDropped).toBe(false);
});

test("endsOnAssistant: true only when the LAST wire row is a non-tool-exchange assistant row", () => {
  const trailing = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("continue:"), { role: "assistant", content: [{ type: "text", text: "Once upon a" }] }],
  });
  expect(trailing.endsOnAssistant).toBe(true);

  const afterUser = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [{ role: "assistant", content: [{ type: "text", text: "hi" }] }, userRow("hello")],
  });
  expect(afterUser.endsOnAssistant).toBe(false);

  // A trailing assistant row that IS a tool exchange (a tool-call) does not count as the prefill shape.
  const toolExchange = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("hi"), { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", name: "f", arguments: "{}" }] }],
  });
  expect(toolExchange.endsOnAssistant).toBe(false);
});

test("an empty user/assistant row (blank text, no other content) is dropped BEFORE indexing — plan and prompt stay aligned", () => {
  const plan = buildWirePlan({
    systemPrompt: { static: "", dynamic: "" },
    history: [userRow("real question"), { role: "assistant", content: [{ type: "text", text: "   " }] }, userRow("follow-up")],
  });
  expect(plan.prompt.map((m) => m.role)).toEqual(["user", "user"]);
  expect(plan.rows).toHaveLength(2);
});

// ── mediaFilePart: data-URI split vs plain URL ─────────────────────────────────────────────────────────

test("mediaFilePart splits a data: URI into its resolved mime + bytes; a plain URL rides as a url part", () => {
  expect(mediaFilePart({ kind: "image", url: "data:image/png;base64,YWJj" })).toEqual({
    type: "file",
    mediaType: "image/png",
    data: { type: "data", data: "YWJj" },
  });
  const urlPart = mediaFilePart({ kind: "video", url: "https://example.com/clip.mp4" });
  expect(urlPart.type).toBe("file");
  expect(urlPart.mediaType).toBe("video");
  expect(urlPart.data).toEqual({ type: "url", url: new URL("https://example.com/clip.mp4") });
});
