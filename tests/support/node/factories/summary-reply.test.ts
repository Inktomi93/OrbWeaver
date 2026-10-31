// @subject tests/support/node/factories/summary-reply.ts
import { expect, test } from "../fixtures.ts";
import { summaryReply } from "./summary-reply.ts";

test("the reply is the anchor line, the facts line and a trailing comma-joined Keywords line", () => {
  expect(summaryReply({ anchor: "A scene", facts: "The keeper waits.", keywords: ["loom", "orbit"] })).toBe(
    "A scene\nThe keeper waits.\nKeywords: loom, orbit",
  );
});
