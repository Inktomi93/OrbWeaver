// SHAPE substrate: spliceInChatInjections + frameInjection (chat.md Part II §3 rule 7 — in_chat depth
// semantics: depth-from-end, clamp-once, depth-DESC, assistant@0→1 floor; system→user framing).
import type { ChatInjection } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { describe } from "vitest";
import { frameInjection, spliceInChatInjections } from "../../../../../packages/server/src/domain/chat/assembly/injections";
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

  test("a host's PROSE override replaces the frame and keeps the content at its {{note}} token", () => {
    // PROSE-1: the two note frames are `chat.injection.*` slots resolved under the ROOM HOST. The proof that
    // matters is that the host's bytes — not the shipped frame — reach the wire, with the injection's own
    // content still spliced in.
    const prose: ProseOverrides = {
      "chat.injection.userNote": { text: "((the table says: {{note}}))", baseVersion: 1 },
      "chat.injection.systemNote": { text: "<<system — {{note}}>>", baseVersion: 1 },
    };
    expect(frameInjection("user", "hi", undefined, prose)).toBe("((the table says: hi))");
    expect(frameInjection("user", "hi", "system", prose)).toBe("<<system — hi>>");
    // The bare roles never wear a frame at all, so no override can reach them.
    expect(frameInjection("system", "hi", undefined, prose)).toBe("hi");
    expect(frameInjection("assistant", "hi", undefined, prose)).toBe("hi");
  });

  test("an absent / empty override record is byte-identical to the shipped frames", () => {
    expect(frameInjection("user", "hi", undefined, {})).toBe(frameInjection("user", "hi"));
    expect(frameInjection("user", "hi", "system", {})).toBe(frameInjection("user", "hi", "system"));
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
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "assistant", content: "cont" })]);
    expect(out.at(-1)).toEqual({ role: "user", content: "tail" });
    expect(out[HIST.length - 1]).toEqual({ role: "assistant", content: "cont" });
  });

  test("role=system + in_chat auto-converts to user with [Note from system: …] framing", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })]);
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from system: sys]" });
  });

  test("co-located injections splice by order ASC — LOWER order lands higher/top (ST parity)", () => {
    // Input is high-then-low in array order, so passing this PROVES the ascending sort ran (array order
    // alone would put "high" on top). ST semantics: "Ordered from low/top to high/bottom" — lower `order`
    // sits higher (smaller index), higher `order` lands closer to the tail. (Was DESC — inverted vs ST.)
    const out = spliceInChatInjections(HIST, [inj({ depth: 1, order: 200, content: "high" }), inj({ depth: 1, order: 10, content: "low" })]);
    const low = out.findIndex((m) => m.content === "[Note from user: low]");
    const high = out.findIndex((m) => m.content === "[Note from user: high]");
    expect(low).toBeLessThan(high);
  });

  test("resolveContent is applied BEFORE framing", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, content: "RAW" })], (c) => c.toLowerCase());
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from user: raw]" });
  });

  test("squashSystemMessages: consecutive same-depth system notes merge into ONE framed row (blank-line join)", () => {
    const out = spliceInChatInjections(
      HIST,
      [inj({ depth: 0, role: "system", content: "sys-a" }), inj({ depth: 0, role: "system", content: "sys-b" })],
      (c) => c,
      { squashSystemMessages: true },
    );
    // Merge-BEFORE-convert: one `[Note from system: …]` bracket carrying both notes, not two.
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from system: sys-a\n\nsys-b]" });
    expect(out.filter((m) => m.content.includes("[Note from system:"))).toHaveLength(1);
  });

  test("squashSystemMessages OFF (default): system notes stay SEPARATE (each its own bracket)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys-a" }), inj({ depth: 0, role: "system", content: "sys-b" })]);
    expect(out.filter((m) => m.content.includes("[Note from system:"))).toHaveLength(2);
  });

  test("squashSystemMessages: a non-system note between two system notes BREAKS the run (order-adjacency)", () => {
    // order asc within a depth: sys(10), user(20), sys(30) → the user note sits between → two system brackets.
    const out = spliceInChatInjections(
      HIST,
      [
        inj({ depth: 0, order: 10, role: "system", content: "sa" }),
        inj({ depth: 0, order: 20, role: "user", content: "mid" }),
        inj({ depth: 0, order: 30, role: "system", content: "sb" }),
      ],
      (c) => c,
      { squashSystemMessages: true },
    );
    expect(out.filter((m) => m.content.includes("[Note from system:"))).toHaveLength(2);
  });

  test("squashSystemMessages: DIFFERENT depths never merge (non-adjacent in the delivered array)", () => {
    const out = spliceInChatInjections(
      HIST,
      [inj({ depth: 0, role: "system", content: "tail-sys" }), inj({ depth: 1, role: "system", content: "mid-sys" })],
      (c) => c,
      { squashSystemMessages: true },
    );
    expect(out.filter((m) => m.content.includes("[Note from system:"))).toHaveLength(2);
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

describe("spliceInChatInjections — allowMidConversationSystem (turns.midConversationSystem)", () => {
  test("allowed: a depth-0 system injection delivers as a REAL system row (bare content, no note framing)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })], (c) => c, { allowMidConversationSystem: true });
    expect(out.at(-1)).toEqual({ role: "system", content: "sys" });
  });

  test("allowed: depth > 0 STILL demotes (the wire-tested channel is tail-only; never a mid-history system row)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 1, role: "system", content: "sys" })], (c) => c, { allowMidConversationSystem: true });
    expect(out[HIST.length - 1]).toEqual({ role: "user", content: "[Note from system: sys]" });
  });

  test("absent/false: the demote path is byte-identical to the pre-capability behavior (regression pin)", () => {
    const off = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })]);
    const explicitOff = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })], (c) => c, { allowMidConversationSystem: false });
    expect(off.at(-1)).toEqual({ role: "user", content: "[Note from system: sys]" });
    expect(explicitOff).toEqual(off);
  });

  test("allowed + squashSystemMessages: a depth-0 run merges to ONE bare system row (blank-line join)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "a" }), inj({ depth: 0, role: "system", content: "b" })], (c) => c, {
      allowMidConversationSystem: true,
      squashSystemMessages: true,
    });
    expect(out.at(-1)).toEqual({ role: "system", content: "a\n\nb" });
  });

  test("allowed: user injections keep their [Note from user:] framing (only the system axis changes)", () => {
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "user", content: "u" })], (c) => c, { allowMidConversationSystem: true });
    expect(out.at(-1)).toEqual({ role: "user", content: "[Note from user: u]" });
  });

  test("the host's PROSE frames ride the SPLICE too — a demoted system injection wears the host's wording", () => {
    // The splice is the other half of the frame's blast radius (the BUILD walk is the first): both funnel
    // through `frameInjection`, so threading `prose` on the splice opts is what makes the seam ONE home.
    const prose: ProseOverrides = { "chat.injection.systemNote": { text: "<<system — {{note}}>>", baseVersion: 1 } };
    const out = spliceInChatInjections(HIST, [inj({ depth: 0, role: "system", content: "sys" })], (c) => c, { prose });
    expect(out.at(-1)).toEqual({ role: "user", content: "<<system — sys>>" });
  });
});
