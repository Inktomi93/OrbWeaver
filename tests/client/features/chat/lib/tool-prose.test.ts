import type { ToolCallRecord } from "@orb/contracts/chat";
import { separateToolProse } from "../../../../../packages/client/src/features/chat/lib/tool-prose.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const record: ToolCallRecord = { toolCallId: "call-1", name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1, textOffset: 7 };

test("prose separates at tool boundaries without changing its canonical input", () => {
  const content = "Before.After.";
  expect(separateToolProse(content, [record, { ...record, toolCallId: "call-2" }])).toBe("Before.\n\nAfter.");
  expect(content).toBe("Before.After.");
  expect(separateToolProse(content, [{ ...record, hidden: true }])).toBe("Before.\n\nAfter.");
  expect(separateToolProse(content, [{ ...record, deleted: true }])).toBe("Before.\n\nAfter.");
});

test("existing whitespace, absent boundaries and the text ends remain unchanged", () => {
  expect(separateToolProse("Before. After.", [record])).toBe("Before. After.");
  expect(separateToolProse("Before.\nAfter.", [record])).toBe("Before.\nAfter.");
  expect(
    separateToolProse("Before.After.", [
      { ...record, textOffset: 0 },
      { ...record, textOffset: 13 },
    ]),
  ).toBe("Before.After.");
  expect(separateToolProse("Before.After.", [])).toBe("Before.After.");
});

test("the completion end separates prose that followed the native tool part from the next reply", () => {
  expect(separateToolProse("Before.After.Done.", [{ ...record, exchangeTextEnd: 13 }])).toBe("Before.\n\nAfter.\n\nDone.");
});
