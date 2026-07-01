import type { DuplicateRelation } from "@orb/contracts/discovery";
import { duplicateRelationSchema, RELATIONS } from "@orb/contracts/discovery";
import { expect, test } from "../../support/fixtures";

// ── The dedup `relation` axis (D34 — promoted to contracts so db `duplicate_chat_pairs.relation` derives it) ──
// The ONE home for the duplicate|forked union (§7.5). A drift here would mean the db enum / CHECK /
// test-mirror have re-spelled it — the whole point of this node. `forked` is meaningful ONLY for chats
// (fork lineage via chats.parentChatId, D27); characters have no forks (D28), so only the chat-pair table
// carries the column.
test("RELATIONS is exactly the 2-member dedup axis [duplicate, forked]", () => {
  expect(RELATIONS).toEqual(["duplicate", "forked"]);
  expect(duplicateRelationSchema.options).toEqual(RELATIONS);
});

test("duplicateRelationSchema round-trips every valid relation and rejects non-members", () => {
  for (const relation of RELATIONS) {
    expect(duplicateRelationSchema.parse(relation)).toBe(relation);
  }
  expect(duplicateRelationSchema.safeParse("nope").success).toBe(false);
  expect(duplicateRelationSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<DuplicateRelation, …>` is tsc-red if a member is added/removed, backing the
// runtime assert above with a compile-time guard (no inline re-spelling anywhere).
const RELATION_SEEN: Record<DuplicateRelation, true> = {
  duplicate: true,
  forked: true,
};
// biome-ignore lint/security/noSecrets: a test description string, not a secret (entropy false-positive).
test("the relation union has no member beyond the tuple (exhaustive over duplicate|forked)", () => {
  expect(Object.keys(RELATION_SEEN).sort()).toEqual([...RELATIONS].sort());
});
