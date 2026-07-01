// backends/kit/history — chatHistoryText: the text of a content-part turn (D45). Text-only extraction;
// image parts are wire-mapped per-backend when vision-input is wired (until then they're dropped here).

import { chatHistoryText } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("chatHistoryText", () => {
  test("joins text parts — a text-only turn is its text", () => {
    expect(chatHistoryText([{ type: "text", text: "hi" }])).toBe("hi");
    expect(
      chatHistoryText([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  test("ignores image parts (text-only extraction until vision-input is wired, D45)", () => {
    expect(chatHistoryText([{ type: "image", url: "https://x/y.png" }])).toBe("");
    expect(
      chatHistoryText([
        { type: "text", text: "see " },
        { type: "image", url: "https://x/y.png" },
        { type: "text", text: "this" },
      ]),
    ).toBe("see this");
  });

  test("empty content → empty string", () => {
    expect(chatHistoryText([])).toBe("");
  });
});
