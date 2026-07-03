// SHAPE substrate: spliceInChatInjections + frameInjection (chat.md Part II §3 rule 7 — in_chat depth
// semantics: depth-from-end, clamp-once, depth-DESC, assistant@0→1 floor; system→user framing).
import type { ChatInjection } from "@orb/contracts/chat";
import { describe } from "vitest";
import {
  frameInjection,
  spliceInChatInjections,
} from "../../../../../packages/server/src/domain/chat/assembly/injections";
import { expect, test } from "../../../../support/fixtures";

const HIST = [
  { role: "assistant" as const, content: "a0" },
  { role: "user" as const, content: "u0" },
  { role: "assistant" as const, content: "a1" },
  { role: "user" as const, content: "tail" },
];

const inj = (over: Partial<ChatInjection>): ChatInjection => ({
  position: "in_chat",
  depth: 0,
  role: "user",
  content: "x",
  ...over,
});

describe("frameInjection", () => {
  test("user → [Note from user: …]; system→user keeps the original-role framing; assistant/system bare", () => {
    expect(frameInjection("user", "hi")).toBe("[Note from user: hi]");
    expect(frameInjection("user", "hi", "system")).toBe("[Note from system: hi]");
    expect(frameInjection("assistant", "hi")).toBe("hi");
    expect(frameInjection("system", "hi")).toBe("hi");
  });

  test("empty / whitespace content → empty string (caller skips it)", () => {
    expect(frameInjection("user", "   ")).toBe("");
  });
});

describe("spliceInChatInjections", () => {
  test("no injections → returns the history unchanged (a fresh array)", () => {
    expect(spliceInChatInjections(HIST, [])).toEqual(HIST);
    expect(spliceInChatInjections(HIST, undefined)).toEqual(HIST);
  });

  test("depth-0 lands AFTER the tail (last thing the model reads)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, content: "steer" })]);
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from user: steer]" });
  });

  test("depth-1 lands BEFORE the tail", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 1, content: "ooc" })]);
    expect(out[HIST.length - 1]).toEqual({ role: "user", content: "[Note from user: ooc]" });
    expect(out.at(-1)).toEqual({ role: "user", content: "tail" });
  });

  test("over-deep depth clamps to history length (lands at the very top)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 99, content: "deep" })]);
    expect(out[0]).toEqual({ role: "user", content: "[Note from user: deep]" });
  });

  test("assistant @ depth 0 floors to depth 1 (no trailing-assistant prefill)", () => {
    const out = spliceInChatInjections(HIST, [
      inj({ depth: 0, role: "assistant", content: "cont" }),
    ]);
    expect(out.at(-1)).toEqual({ role: "user", content: "tail" });
    expect(out[HIST.length - 1]).toEqual({ role: "assistant", content: "cont" });
  });

  test("role=system + in_chat auto-converts to user with [Note from system: …] framing", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })]);
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from system: sys]" });
  });

  test("co-located injections splice by order DESC (higher order lands first/top)", () => {
    const out = spliceInChatInjections(HIST, [
      inj({ depth: 1, order: 10, content: "low" }),
      inj({ depth: 1, order: 200, content: "high" }),
    ]);
    const a = out.findIndex((m) => m.content === "[Note from user: high]");
    const b = out.findIndex((m) => m.content === "[Note from user: low]");
    expect(a).toBeLessThan(b);
  });

  test("resolveContent is applied BEFORE framing", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, content: "RAW" })], (c) =>
      c.toLowerCase(),
    );
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from user: raw]" });
  });

  test("generic: canon rows keep their extra fields through the splice (name-stamp depends on it)", () => {
    const canon = [
      { role: "assistant" as const, content: "a", authorName: "Aria", characterId: "char_aria" },
      { role: "user" as const, content: "tail" },
    ];
    const out = spliceInChatInjections(canon, [inj({ depth: 1, content: "n" })]);
    expect(out[0]).toEqual({
      role: "assistant",
      content: "a",
      authorName: "Aria",
      characterId: "char_aria",
    });
  });
});
