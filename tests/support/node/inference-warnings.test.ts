// @subject tests/support/node/inference-warnings.ts
import type { ChatEvent } from "@orb/inference";
import { expect, test } from "vitest";
import { warningCodes } from "./inference-warnings.ts";

test("only warning events contribute, each by its code and in order", () => {
  const events: ChatEvent[] = [
    { kind: "warning", at: 1, code: "effort_dropped", message: "first" },
    { kind: "warning", at: 2, code: "tool_choice_downgraded", message: "second" },
  ];
  expect(warningCodes(events)).toEqual(["effort_dropped", "tool_choice_downgraded"]);
  expect(warningCodes([])).toEqual([]);
});
