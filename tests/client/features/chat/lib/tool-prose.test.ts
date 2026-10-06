import type { ToolCallRecord } from "@orb/contracts/chat";
import { toolBoundaryDisplayMessage } from "../../../../../packages/client/src/features/chat/lib/tool-prose.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeMessageView } from "../fixtures.ts";

function displayed(content: string, toolCalls: readonly ToolCallRecord[]): string {
  const canonical = makeMessageView({ content, toolCalls });
  const rendered = toolBoundaryDisplayMessage(canonical, false);
  expect(canonical.content).toBe(content);
  expect(toolBoundaryDisplayMessage(canonical, true)).toBe(canonical);
  return rendered.content;
}

const record: ToolCallRecord = { toolCallId: "call-1", name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1, textOffset: 7 };

test("prose separates at tool boundaries without changing its canonical input", () => {
  const content = "Before.After.";
  expect(displayed(content, [record, { ...record, toolCallId: "call-2" }])).toBe("Before.\n\nAfter.");
  expect(content).toBe("Before.After.");
  expect(displayed(content, [{ ...record, hidden: true }])).toBe("Before.\n\nAfter.");
  expect(displayed(content, [{ ...record, deleted: true }])).toBe("Before.\n\nAfter.");
});

test("existing whitespace, absent boundaries and the text ends remain unchanged", () => {
  expect(displayed("Before. After.", [record])).toBe("Before. After.");
  expect(displayed("Before.\nAfter.", [record])).toBe("Before.\nAfter.");
  expect(
    displayed("Before.After.", [
      { ...record, textOffset: 0 },
      { ...record, textOffset: 13 },
    ]),
  ).toBe("Before.After.");
  expect(displayed("Before.After.", [])).toBe("Before.After.");
});

test("the completion end separates prose that followed the native tool part from the next reply", () => {
  expect(displayed("Before.After.Done.", [{ ...record, exchangeTextEnd: 13 }])).toBe("Before.\n\nAfter.\n\nDone.");
});
