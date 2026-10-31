// @subject tests/support/node/inference-warnings.ts
import { WARNING_CODE } from "@orb/contracts/inference";
import type { ChatEvent } from "@orb/inference";
import { expect, test } from "vitest";
import { warningCodes } from "./inference-warnings.ts";

test("only warning events contribute, each by its code and in order", () => {
  const events: ChatEvent[] = [
    { kind: "warning", at: 1, code: WARNING_CODE.effortDropped, message: "first" },
    { kind: "warning", at: 2, code: WARNING_CODE.toolChoiceDowngraded, message: "second" },
  ];
  expect(warningCodes(events)).toEqual([WARNING_CODE.effortDropped, WARNING_CODE.toolChoiceDowngraded]);
  expect(warningCodes([])).toEqual([]);
});
