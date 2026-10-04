// The Custom body fields' paste reader: every format a server's docs print reads to the one object the request
// carries, and text that reads as nothing names why instead of saving.

import { describe } from "vitest";
import {
  fieldText,
  looksLikeFields,
  looksStructured,
  parsePastedObject,
  parsePastedStructure,
} from "../../../../../packages/client/src/features/credentials/lib/pasted-fields.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const VLLM_FIELDS = { ["chat_template_kwargs"]: { ["enable_thinking"]: false }, stop: ["</s>", "<|im_end|>"], ["top_k"]: 40 };

describe("parsePastedObject reads every pasted format to the same object", () => {
  test.each([
    ["strict JSON", '{"chat_template_kwargs": {"enable_thinking": false}, "stop": ["</s>", "<|im_end|>"], "top_k": 40}'],
    ["YAML with a nested block", "chat_template_kwargs:\n  enable_thinking: false\nstop:\n  - </s>\n  - <|im_end|>\ntop_k: 40"],
    ["unquoted keys, single quotes and trailing commas", "{chat_template_kwargs: {enable_thinking: false,}, stop: ['</s>', '<|im_end|>',], top_k: 40,}"],
    ["key=value lines", 'chat_template_kwargs={"enable_thinking": false}\nstop=["</s>", "<|im_end|>"]\ntop_k=40'],
    [
      "key=value lines with flow values and a comment",
      "# from the vLLM docs\nchat_template_kwargs = {enable_thinking: false}\nstop = ['</s>', '<|im_end|>']\ntop_k = 40",
    ],
  ])("%s", async (_format, pasted) => {
    expect(await parsePastedObject(pasted)).toEqual({ ok: true, value: VLLM_FIELDS });
  });

  test("a guided_json schema and a structured_outputs block keep their nesting", async () => {
    const pasted = "guided_json:\n  type: object\n  properties:\n    name: {type: string}\n  required: [name]\nstructured_outputs:\n  choice: [yes, no]";
    expect(await parsePastedObject(pasted)).toEqual({
      ok: true,
      value: {
        ["guided_json"]: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        ["structured_outputs"]: { choice: ["yes", "no"] },
      },
    });
  });

  test("a key=value value that is plain text stays text", async () => {
    expect(await parsePastedObject("mode=research\nnote=")).toEqual({ ok: true, value: { mode: "research", note: "" } });
  });

  test.each([
    ["an unclosed list", "stop: [</s>"],
    ["a duplicated key", "top_k: 40\ntop_k: 20"],
    ["a single value", "research"],
    ["a list", "- a\n- b"],
    ["a key glued to its value", "{top_k:40}"],
  ])("%s is refused with a reason", async (_case, pasted) => {
    const read = await parsePastedObject(pasted);
    expect(read.ok).toBe(false);
    expect(read.ok ? "" : read.reason).not.toBe("");
  });
});

test("a structured field value reads to its object or list; a scalar block is refused", async () => {
  expect(await parsePastedStructure("enable_thinking: false\ndocuments: []")).toEqual({ ok: true, value: { ["enable_thinking"]: false, documents: [] } });
  expect(await parsePastedStructure("[1, 2,]")).toEqual({ ok: true, value: [1, 2] });
  expect((await parsePastedStructure("{enable_thinking: false")).ok).toBe(false);
});

test("which text is fields, which is a structured value, and which is one plain value", () => {
  expect(looksLikeFields("top_k: 40")).toBe(true);
  expect(looksLikeFields("top_k=40")).toBe(true);
  expect(looksLikeFields('{"top_k": 40}')).toBe(true);
  expect(looksLikeFields("top_k")).toBe(false);
  expect(looksLikeFields("http://proxy.test/v1")).toBe(false);
  expect(looksStructured("[1, 2]")).toBe(true);
  expect(looksStructured("enable_thinking: false\ndocuments: []")).toBe(true);
  expect(looksStructured("a: b")).toBe(false);
  expect(looksStructured("first line\nsecond line")).toBe(false);
});

test("a field shows a string as typed unless it would read back as another type", () => {
  expect(fieldText("research")).toBe("research");
  expect(fieldText("40")).toBe('"40"');
  expect(fieldText(40)).toBe("40");
  expect(fieldText({ ["enable_thinking"]: false })).toBe('{\n  "enable_thinking": false\n}');
});
