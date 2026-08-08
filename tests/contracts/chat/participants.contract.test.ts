import type { MessageKind } from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND, MEMORY_INGEST_KINDS, MESSAGE_KIND_POLICY, MESSAGE_KINDS, messageKindSchema, messageRoleSchema } from "@orb/contracts/chat";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { expect, test } from "../../support/fixtures.ts";

// ═══ messageRoleSchema — THE canonical role wire (D32) ══════════════════════════

test("messageRoleSchema is z.enum(MESSAGE_ROLES) and round-trips system|user|assistant", () => {
  for (const role of MESSAGE_ROLES) {
    expect(messageRoleSchema.parse(role)).toBe(role);
  }
  expect(messageRoleSchema.options).toEqual(["system", "user", "assistant"]);
  expect(messageRoleSchema.safeParse("tool").success).toBe(false);
});

// ═══ MESSAGE_KINDS — the row-PURPOSE axis + its total policy ════════════════════
// (stickler 2026-08-08 canon-message-identity §R1; owner-ruled vocabulary 2026-08-07.)

test("messageKindSchema is z.enum(MESSAGE_KINDS) — the three ruled members, and nothing else", () => {
  for (const kind of MESSAGE_KINDS) {
    expect(messageKindSchema.parse(kind)).toBe(kind);
  }
  expect(messageKindSchema.options).toEqual(["standard", "narrator", "comment"]);
  // `aside` is a NAMED DOORWAY, not a member — D41: a kind waits for a writer. Adding it must be a
  // deliberate tuple edit that tsc then forces through every policy row and dispatch.
  expect(messageKindSchema.safeParse("aside").success).toBe(false);
  expect(DEFAULT_MESSAGE_KIND).toBe("standard");
  expect(messageKindSchema.safeParse(DEFAULT_MESSAGE_KIND).success).toBe(true);
});

test("MESSAGE_KIND_POLICY is TOTAL over the axis and carries the ruled cells", () => {
  // Totality is the compile-force (a `Record<MessageKind, …>`); this pins that no member was left with a
  // placeholder row and that the shipped semantics are the ones the design ruled.
  expect(Object.keys(MESSAGE_KIND_POLICY).sort()).toEqual(MESSAGE_KINDS.toSorted());
  expect(MESSAGE_KIND_POLICY.standard).toEqual({ prompt: "conversation", memory: "ingest", reading: "show" });
  // A narrator recap IS story canon: prompt-eligible and digested. `system-channel` marks it ELIGIBLE for the
  // capability-gated wire mapping — dormant until a live probe measures it per model, so nothing ships live.
  expect(MESSAGE_KIND_POLICY.narrator).toEqual({ prompt: "system-channel", memory: "ingest", reading: "show" });
  // An OOC comment is readable forever but never prompt material and never story — that pairing is the whole
  // reason the kind exists (it is also the home an unseated agent's out-of-band reaction lands in).
  expect(MESSAGE_KIND_POLICY.comment).toEqual({ prompt: "never", memory: "exclude", reading: "show" });
  // EVERY kind shows: kind is chrome vocabulary, never a secrecy axis (that plane is the `hidden` CONTENT
  // class + the member strip). A future `reading: "hide"` cell would be a trust-boundary change, not a tweak.
  for (const kind of MESSAGE_KINDS) {
    expect(MESSAGE_KIND_POLICY[kind].reading).toBe("show");
  }
});

test("MEMORY_INGEST_KINDS is DERIVED from the policy, never re-spelled", () => {
  expect([...MEMORY_INGEST_KINDS]).toEqual(MESSAGE_KINDS.filter((k) => MESSAGE_KIND_POLICY[k].memory === "ingest"));
  expect([...MEMORY_INGEST_KINDS]).toEqual(["standard", "narrator"]);
  const excluded: readonly MessageKind[] = MESSAGE_KINDS.filter((k) => !MEMORY_INGEST_KINDS.includes(k));
  expect([...excluded]).toEqual(["comment"]);
});
