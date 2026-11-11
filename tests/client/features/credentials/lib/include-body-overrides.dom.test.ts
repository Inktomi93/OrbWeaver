// The request-body overrides field reads pasted YAML and `key=value` text, so a value no JSON text holds can reach it;
// it refuses one, top level or nested, rather than save a request that carries null in its place.
// @subject packages/client/src/features/credentials/lib/connection-editor-model.ts
// @subject packages/contracts/src/inference/connection.ts
import { expect, test } from "@orb/testkit/node";
import { INCLUDE_BODY_SHAPE_REASON, parseIncludeBody } from "#client/features/credentials/lib/connection-editor-model.ts";

const NON_JSON_PASTES = [
  ["an infinite YAML number", "top_p: .inf"],
  ["a YAML not-a-number", "temperature: .nan"],
  ["a nested YAML not-a-number", "chat_template_kwargs:\n  scale: .nan"],
  ["an overflowing JSON number", '{"top_k":1e400}'],
  ["an infinite key=value number", "top_p=.inf"],
] as const;

test("the overrides field refuses a pasted value no JSON text can hold, and names why", async () => {
  for (const [what, paste] of NON_JSON_PASTES) {
    expect(await parseIncludeBody(paste), what).toEqual({ ok: false, reason: INCLUDE_BODY_SHAPE_REASON });
  }
});

test("the overrides field saves plain nested overrides from YAML and JSON as the object they state", async () => {
  const expected = { ["top_k"]: 40, ["chat_template_kwargs"]: { ["enable_thinking"]: false, scale: 0.5 }, stop: ["</s>"] };
  const yaml = "top_k: 40\nchat_template_kwargs:\n  enable_thinking: false\n  scale: 0.5\nstop:\n  - </s>";

  expect(await parseIncludeBody(yaml)).toEqual({ ok: true, includeBody: expected });
  expect(await parseIncludeBody(JSON.stringify(expected))).toEqual({ ok: true, includeBody: expected });
});
