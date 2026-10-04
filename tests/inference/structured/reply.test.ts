// The reply half of the plan: a null is dropped only at a path the reshape made nullable. A null the author's schema
// declared is the author's value and survives; an unreshaped plan drops nothing.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatResult } from "../../../packages/inference/src/contract/chat.ts";
import type { PlannedResponseFormat, StructuredPlan } from "../../../packages/inference/src/structured/plan.ts";
import { normalizeStructuredText, normalizeStructuredValue, structuredChatResult } from "../../../packages/inference/src/structured/reply.ts";
import { expect, test } from "../../support/fixtures.ts";

function format(reshapedPaths: readonly string[], vehicle: PlannedResponseFormat["vehicle"] = "response-format"): PlannedResponseFormat {
  return { name: "row", schema: {}, strict: true, vehicle, nullMeansAbsent: reshapedPaths.length > 0, reshapedPaths };
}

test("a nullable REQUIRED field keeps its null under strict-compatible; a reshaped optional's null is dropped", () => {
  const reply = { verdict: null, note: null, score: 3 };
  expect(normalizeStructuredValue(reply, ["note"])).toEqual({ verdict: null, score: 3 });
});

test("a reshaped optional inside an array of objects drops at every index, and a null element of the array stays", () => {
  const reply = {
    changes: [
      { field: "a", value: null },
      { field: "b", value: "x" },
      { field: "c", value: null },
    ],
    tags: [null, "t"],
  };
  expect(normalizeStructuredValue(reply, ["changes[*].value"])).toEqual({
    changes: [{ field: "a" }, { field: "b", value: "x" }, { field: "c" }],
    tags: [null, "t"],
  });
});

test("an unreshaped plan drops nothing, and its text is returned byte for byte", () => {
  const text = '{"a": null,  "b": [null]}';
  expect(normalizeStructuredText(text, format([]))).toBe(text);
  expect(normalizeStructuredValue({ a: null }, [])).toEqual({ a: null });
});

test("a quoted path segment and a map-value wildcard address their nulls", () => {
  expect(normalizeStructuredValue({ "odd key": null, keep: null }, ['["odd key"]'])).toEqual({ keep: null });
  expect(normalizeStructuredValue({ byId: { a: { v: null }, b: { v: 1 } } }, ["byId{*}.v"])).toEqual({ byId: { a: {}, b: { v: 1 } } });
});

test("a reply that is not bare JSON is read tolerantly; one with no object is returned for the caller's own parse to refuse", () => {
  expect(normalizeStructuredText('```json\n{"note": null, "k": 1}\n```', format(["note"]))).toBe('{"k":1}');
  expect(normalizeStructuredText("no json here", format(["note"]))).toBe("no json here");
});

function chatResult(reply: string, toolCalls?: ChatResult["toolCalls"]): ChatResult {
  return {
    reply,
    toolCalls,
    reasoning: "",
    reasoningRedacted: false,
    stopReason: null,
    terminalReason: null,
    finishReason: "stop",
    ttftMs: null,
    durationApiMs: null,
    apiErrorStatus: null,
    numTurns: 1,
    appliedEffort: null,
    usage: {
      model: castId<ModelId>("test-model"),
      tokensIn: null,
      tokensOut: null,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: null,
      contextWindow: null,
      maxOutputTokens: null,
      costUsd: null,
      costDetails: null,
      costProvenance: "measured",
    },
    events: [],
    rateLimit: null,
  };
}

function planWith(responseFormat: PlannedResponseFormat): StructuredPlan {
  return { ok: true, mode: "strict-compatible", responseFormat, downgrades: [] };
}

test("a chat turn under a tool vehicle answers with the structured call's arguments, and a turn with no call answers empty", () => {
  const called = structuredChatResult(
    chatResult("Sure, here it is.", [
      { toolCallId: "c1", name: "row", arguments: '{"note":null,"k":1}' },
      { toolCallId: "c2", name: "other", arguments: "{}" },
    ]),
    planWith(format(["note"], "forced-tool")),
  );
  expect(called.reply).toBe('{"k":1}');
  expect(called.toolCalls?.map((call) => call.name)).toEqual(["other"]);
  // The model's prose is never the payload.
  expect(structuredChatResult(chatResult("I chose not to call it."), planWith(format([], "offered-tool"))).reply).toBe("");
});
