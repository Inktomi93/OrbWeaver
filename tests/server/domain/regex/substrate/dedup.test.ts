// substrate/dedup — THE DEDUP RULE, pure. No db, no clock: the planner takes the caller's reads and returns
// a verdict, which is why it can be exercised here without a database at all.
//
// The rule's two halves and why each is load-bearing:
//   • CONTENT equality is name + KEY-SORTED body JSON. A re-encoded identical script (different key order,
//     same meaning) must still match, or re-importing a card pack breeds a duplicate library every time.
//   • CARRIED REFERENCES win TOTALLY — any resolved reference skips the by-value payload, so a script
//     edited after export is not re-minted from its own stale snapshot.

import type { RegexScriptCard, RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema, regexScriptCardSchema, regexScriptSchema } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { dedupKey, findDuplicate, planCardLift, rowKey, splitScript } from "../../../../../packages/server/src/domain/regex/substrate/dedup.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const body = (over: Record<string, unknown> = {}): ReturnType<typeof regexScriptBehaviorSchema.parse> =>
  regexScriptBehaviorSchema.parse({ findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"], ...over });

// A row id is a real `regex_script_…` TypeID (the row schema validates the prefix AND the 26-char suffix),
// so the readable LABEL a test uses to refer to a fixture gets one stable minted id.
const idsByLabel = new Map<string, RegexScriptId>();
function idFor(label: string): RegexScriptId {
  const existing = idsByLabel.get(label);
  if (existing !== undefined) {
    return existing;
  }
  const minted = mintTypeId(ID_PREFIX.regexScript);
  idsByLabel.set(label, minted);
  return minted;
}

// Both fixtures go through their REAL schema, so a field added to either wire shape breaks the fixture
// here rather than surviving as a silent gap in the planner's coverage.
/** The edit stamp DEFAULTS PER LABEL, so every fixture row carries a DIFFERENT one. That is the point: the
 *  dedup key is content-equality, and a stamp is not content — two byte-identical scripts saved an hour
 *  apart must still match (they did not, the day `updatedAt` landed on the row). */
const row = (label: string, name: string, over: Record<string, unknown> = {}): RegexScriptRow =>
  regexScriptSchema.parse({ id: idFor(label), name, enabled: true, updatedAt: 1_760_000_000_000 + label.length, ...body(over) });

const card = (id: string, name: string, over: Record<string, unknown> = {}): RegexScriptCard =>
  regexScriptCardSchema.parse({ id, name, enabled: true, ...body(over) });

/** A deterministic minter — the planner takes it injected, never an ambient mint. */
function minter(): () => RegexScriptId {
  let n = 0;
  return (): RegexScriptId => {
    n += 1;
    return idFor(`minted-${n}`);
  };
}

describe("dedupKey", () => {
  test("is stable across BODY KEY ORDER — a re-encoded identical script still matches", () => {
    const a = regexScriptBehaviorSchema.parse({ findRegex: "x", replaceString: "y", placement: ["DISPLAY"] });
    // The same fields, constructed in a different order. JSON key order is not semantic, and a naive
    // JSON.stringify would have made these two different keys.
    const b = regexScriptBehaviorSchema.parse({ placement: ["DISPLAY"], replaceString: "y", findRegex: "x" });
    expect(dedupKey("n", a)).toBe(dedupKey("n", b));
  });

  test("separates on NAME as well as body — same rule, different label, different script", () => {
    expect(dedupKey("one", body())).not.toBe(dedupKey("two", body()));
  });

  test("separates on any body field", () => {
    expect(dedupKey("n", body())).not.toBe(dedupKey("n", body({ replaceString: "different" })));
    expect(dedupKey("n", body())).not.toBe(dedupKey("n", body({ placement: ["DISPLAY"] })));
  });

  test("rowKey is the same function applied to a row (id/enabled are NOT identity)", () => {
    // Two rows with different ids and enable-state but the same authored content are the SAME script.
    expect(rowKey(row("regex_script_1", "n"))).toBe(rowKey({ ...row("regex_script_2", "n"), enabled: false }));
  });
});

describe("splitScript", () => {
  test("drops the foreign id and the portable `global` flag (an ATTACHMENT, not behavior)", () => {
    const split = splitScript({ ...card("st-1", "n"), global: true });
    expect(split.name).toBe("n");
    expect(split.behavior).not.toHaveProperty("global");
    expect(split.behavior).not.toHaveProperty("id");
  });
});

describe("planCardLift", () => {
  test("a FOREIGN card with an empty library mints every script, in card order", () => {
    const plan = planCardLift({ existing: [], carriedIds: [], scripts: [card("a", "one"), card("b", "two")], mintId: minter() });
    expect(plan.inserts.map((i) => i.name)).toEqual(["one", "two"]);
    expect(plan.attachIds).toEqual(plan.inserts.map((i) => i.id));
    expect(plan.reused).toBe(0);
  });

  test("content-equal candidates REUSE the existing row rather than cloning", () => {
    const existing = row("regex_script_have", "shared");
    const plan = planCardLift({ existing: [existing], carriedIds: [], scripts: [card("foreign-id", "shared")], mintId: minter() });
    expect(plan.inserts).toEqual([]);
    expect(plan.attachIds).toEqual([existing.id]);
    expect(plan.reused).toBe(1);
  });

  test("a card carrying the SAME script twice attaches it once (no duplicate junction rows)", () => {
    const plan = planCardLift({ existing: [], carriedIds: [], scripts: [card("a", "dup"), card("b", "dup")], mintId: minter() });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.attachIds).toHaveLength(1);
  });

  test("ANY carried reference skips the by-value payload wholesale", () => {
    const carried = idFor("carried");
    const plan = planCardLift({
      existing: [],
      carriedIds: [carried],
      // A body that matches NOTHING in `existing` — content dedup would have minted it.
      scripts: [card("st-1", "stale snapshot", { findRegex: "old" })],
      mintId: minter(),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.attachIds).toEqual([carried]);
    expect(plan.reused).toBe(1);
  });

  test("attachIds ORDER is the attachment order (index = junction position)", () => {
    const existing = row("regex_script_have", "second");
    const plan = planCardLift({
      existing: [existing],
      carriedIds: [],
      scripts: [card("a", "first"), card("b", "second"), card("c", "third")],
      mintId: minter(),
    });
    // The reused row keeps its slot in the CARD's order, between the two minted ones.
    expect(plan.attachIds[1]).toBe(existing.id);
    expect(plan.attachIds).toHaveLength(3);
  });
});

describe("findDuplicate", () => {
  test("finds a content-equal row and returns null otherwise", () => {
    const existing = row("regex_script_have", "n");
    expect(findDuplicate([existing], { name: "n", enabled: true, behavior: body() })).toBe(existing.id);
    expect(findDuplicate([existing], { name: "n", enabled: true, behavior: body({ findRegex: "other" }) })).toBeNull();
    expect(findDuplicate([], { name: "n", enabled: true, behavior: body() })).toBeNull();
  });
});
