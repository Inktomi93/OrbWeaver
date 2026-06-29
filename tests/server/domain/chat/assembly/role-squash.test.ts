// SHAPE shaper: squashSameRole (chat.md Part II §3 rule 6 — Anthropic adjacent-same-role defense).
import { describe, expect, test } from "vitest";
import { squashSameRole } from "../../../../../packages/server/src/domain/chat/assembly/role-squash";

describe("squashSameRole", () => {
  test("alternating canon passes through untouched (the common case)", () => {
    const h = [
      { role: "assistant" as const, content: "greeting" },
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "a1" },
    ];
    expect(squashSameRole(h)).toEqual(h);
  });

  test("merges adjacent same-role with a blank-line join", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "note" },
        { role: "user" as const, content: "u2" },
      ]),
    ).toEqual([{ role: "user", content: "note\n\nu2" }]);
  });

  test("drops empty / whitespace-only rows before squashing", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "u1" },
        { role: "assistant" as const, content: "   " },
        { role: "user" as const, content: "u2" },
      ]),
    ).toEqual([{ role: "user", content: "u1\n\nu2" }]);
  });

  test("first-wins: extra fields on the FIRST of a same-role run are preserved (name-stamp relies on it)", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "first line", authorName: "User" },
        { role: "user" as const, content: "second line" },
      ]),
    ).toEqual([{ role: "user", content: "first line\n\nsecond line", authorName: "User" }]);
  });

  test("a three-run collapses to one (the egocentric scoped fold)", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "Aria: greeting" },
        { role: "user" as const, content: "u1" },
        { role: "user" as const, content: "Aria: Aria replies" },
        { role: "assistant" as const, content: "Kai replies" },
      ]),
    ).toEqual([
      { role: "user", content: "Aria: greeting\n\nu1\n\nAria: Aria replies" },
      { role: "assistant", content: "Kai replies" },
    ]);
  });
});
