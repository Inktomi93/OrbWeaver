// SHAPE shaper: squashSameRole (the chat design doc Part II §3 rule 6 — Anthropic adjacent-same-role defense). The
// floor clamp is a contracts read now (`tests/contracts/inference/capability/reads.contract.test.ts`).
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { squashSameRole } from "../../../../../packages/server/src/domain/chat/assembly/role-squash.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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

  // A spliced injection heads the run it merges into (the new-chat marker above the first user turn), and the
  // wire conversion finds the stored row's attachments and card spans by `messageId`. The head's other extras
  // still win; only the stored identity is taken from the first row that has one.
  test("a merged row keeps the stored messageId even when an injection heads the run", () => {
    const stored = castId<MessageId>("message_u1");
    expect(
      squashSameRole([
        { role: "user" as const, content: "[Start a new chat]", speakerless: true },
        { role: "user" as const, content: "u1", messageId: stored },
      ]),
    ).toEqual([{ role: "user", content: "[Start a new chat]\n\nu1", speakerless: true, messageId: stored }]);
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

describe("squashSameRole — system rows (capability-kept depth-0 injections)", () => {
  test("adjacent system rows merge; a system row never folds into a user/assistant neighbor", () => {
    expect(
      squashSameRole([
        { role: "user", content: "u" },
        { role: "system", content: "a" },
        { role: "system", content: "b" },
      ]),
    ).toEqual([
      { role: "user", content: "u" },
      { role: "system", content: "a\n\nb" },
    ]);
  });
});
