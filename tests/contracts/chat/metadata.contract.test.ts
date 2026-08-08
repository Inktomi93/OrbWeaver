import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  MEMBER_CARD_VISIBILITY_LEVELS,
  memberCardVisibilitySchema,
  openingPolicySchema,
  roomOverridesSchema,
} from "@orb/contracts/chat";
import { expect, test } from "../../support/fixtures.ts";

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

// ═══ roomOverrides — exactly the three-field allowlist (.strict) ══════════════════

test("roomOverridesSchema round-trips the three allowlisted fields and rejects any other", () => {
  const overrides = {
    scenario: "a quiet tavern",
    mainPrompt: "be terse",
    postHistory: "stay in character",
  };
  expect(roomOverridesSchema.parse(overrides)).toEqual(overrides);
  expect(Object.keys(roomOverridesSchema.shape).sort()).toEqual(["mainPrompt", "postHistory", "scenario"].sort());
  // A stray field (e.g. a member trying to inject a room-wide persona) is rejected, not carried.
  expect(roomOverridesSchema.safeParse({ persona: "evil twin" }).success).toBe(false);
  expect(DEFAULT_ROOM_OVERRIDES).toEqual({});
});

// RETIRED KEY (owner ruling 2026-08-01): the room author's note was a second home for what
// `chat_injections` owns — both landed as the same `in_chat` at-depth splice. The key is GONE from the
// allowlist, so `.strict()` refuses it in every shape it was ever stored/wired in (the widened directive,
// the pre-#22 bare string). Pre-launch: stored values are debris, not migrated — the read seam's
// `.catch(undefined)` heals a carrying blob to "no room overrides" (see the domain metadata contract test).
test("roomOverridesSchema REJECTS the retired authorsNote key in every legacy shape", () => {
  expect(roomOverridesSchema.safeParse({ authorsNote: { prompt: "it is raining", depth: 3, role: "user" } }).success).toBe(false);
  expect(roomOverridesSchema.safeParse({ authorsNote: { prompt: "just text" } }).success).toBe(false);
  expect(roomOverridesSchema.safeParse({ authorsNote: "Keep it tense." }).success).toBe(false);
  // …and it does not sneak through beside a still-live field.
  expect(roomOverridesSchema.safeParse({ scenario: "a quiet tavern", authorsNote: "Keep it tense." }).success).toBe(false);
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
  expect(openingPolicySchema.options.toSorted()).toEqual(["first-message", "generate", "greet-all", "none"].sort());
});
