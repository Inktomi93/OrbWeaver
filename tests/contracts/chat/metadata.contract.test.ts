import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  MEMBER_CARD_VISIBILITY_LEVELS,
  memberCardVisibilitySchema,
  openingPolicySchema,
  roomOverridesSchema,
} from "@orb/contracts/chat";
import { expect, test } from "../../support/fixtures";

// ═══ groupConfigSchema — memberCardVisibility default sheet (D22) ════════════════

test("groupConfigSchema fills memberCardVisibility to 'sheet' by default (D22)", () => {
  const parsed = groupConfigSchema.parse({ output: "per-speaker", policy: "natural" });
  expect(parsed.memberCardVisibility).toBe("sheet");
  expect(DEFAULT_GROUP_CONFIG.memberCardVisibility).toBe("sheet");
});

test("memberCardVisibility levels are the four D22 levels (floor → full)", () => {
  expect(MEMBER_CARD_VISIBILITY_LEVELS).toEqual(["name-avatar", "sheet", "sheet+lore", "full"]);
  for (const level of MEMBER_CARD_VISIBILITY_LEVELS) {
    expect(memberCardVisibilitySchema.parse(level)).toBe(level);
  }
});

test("groupConfig narrator arm defaults memberCardVisibility AND rejects a stray cardScope (.strict)", () => {
  const narrator = groupConfigSchema.parse({ output: "narrator", policy: "list" });
  expect(narrator.memberCardVisibility).toBe("sheet");
  // narrator ⇒ merged: cardScope is unrepresentable on this arm; .strict() REJECTS it.
  const withStray = groupConfigSchema.safeParse({
    output: "narrator",
    policy: "list",
    cardScope: "scoped",
  });
  expect(withStray.success).toBe(false);
});

test("DEFAULT_GROUP_CONFIG is per-speaker × merged, auto-mode off", () => {
  expect(DEFAULT_GROUP_CONFIG.output).toBe("per-speaker");
  expect(DEFAULT_GROUP_CONFIG.autoMode).toBe(false);
});

// ═══ roomOverrides — exactly the four-field allowlist (.strict) ══════════════════

test("roomOverridesSchema round-trips the four allowlisted fields and rejects any other", () => {
  const overrides = {
    scenario: "a quiet tavern",
    mainPrompt: "be terse",
    postHistory: "stay in character",
    // task #22: authorsNote is now the `{prompt, depth?, role?}` injection directive.
    authorsNote: { prompt: "it is raining", depth: 3, role: "user" as const },
  };
  expect(roomOverridesSchema.parse(overrides)).toEqual(overrides);
  expect(Object.keys(roomOverridesSchema.shape).sort()).toEqual(["authorsNote", "mainPrompt", "postHistory", "scenario"].sort());
  // A stray field (e.g. a member trying to inject a room-wide persona) is rejected, not carried.
  expect(roomOverridesSchema.safeParse({ persona: "evil twin" }).success).toBe(false);
  expect(DEFAULT_ROOM_OVERRIDES).toEqual({});
});

// task #22 MIGRATION: a legacy pre-#22 note is a BARE STRING inside chatMetadata. The `roomAuthorsNoteSchema`
// preprocess coerces string → `{prompt}` so an old stored blob round-trips losslessly through the SAME
// `roomOverridesSchema.safeParse` read seam the metadata parser uses (no data migration, no lost notes).
test("roomOverridesSchema coerces a LEGACY bare-string authorsNote → {prompt} (lossless migration)", () => {
  const parsed = roomOverridesSchema.parse({ authorsNote: "Keep it tense." });
  expect(parsed.authorsNote).toEqual({ prompt: "Keep it tense." });
  // An empty legacy string coerces too (the assembler treats an empty prompt as "no note").
  expect(roomOverridesSchema.parse({ authorsNote: "" }).authorsNote).toEqual({ prompt: "" });
});

test("roomOverridesSchema accepts a directive with just a prompt (depth/role left to the assembler)", () => {
  const parsed = roomOverridesSchema.parse({ authorsNote: { prompt: "just text" } });
  expect(parsed.authorsNote).toEqual({ prompt: "just text" });
});

// D66-B (W5, ruling A): the assistant@depth-0 WRITE-reject is REMOVED — authored prefill is persistable;
// SHAPE normalizes the trailing assistant at delivery on a `assistantPrefill:false` model. Shape
// validation stays.
test("roomOverridesSchema ACCEPTS an assistant@depth-0 authorsNote (normalized at SHAPE delivery, D66-B)", () => {
  expect(roomOverridesSchema.safeParse({ authorsNote: { prompt: "x", depth: 0, role: "assistant" } }).success).toBe(true);
  expect(roomOverridesSchema.safeParse({ authorsNote: { prompt: "x", depth: 1, role: "assistant" } }).success).toBe(true);
  // system/user at depth 0 stay valid.
  expect(roomOverridesSchema.safeParse({ authorsNote: { prompt: "x", depth: 0, role: "system" } }).success).toBe(true);
});

test("openingPolicySchema round-trips its members", () => {
  for (const policy of ["greet-all", "generate", "none", "first-message"] as const) {
    expect(openingPolicySchema.parse(policy)).toBe(policy);
  }
  expect(openingPolicySchema.safeParse("auto").success).toBe(false);
});

test("openingPolicySchema is cardinality-locked (an added member must be a deliberate test edit)", () => {
  // Round-trip + reject alone catch a removed/renamed member but NOT an accidentally-added 5th policy
  // (additive drift). Pin the exact member set so a new opening policy fails here until intended.
  expect([...openingPolicySchema.options].sort()).toEqual(["first-message", "generate", "greet-all", "none"].sort());
});
