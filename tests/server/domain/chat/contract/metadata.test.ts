// domain/chat/contract/metadata — the fault-isolation pin (header's whole claim): a malformed sub-blob
// heals to its own default WITHOUT nuking its siblings, and the top level stays loose (unknown future keys
// survive). Also pins the two load-bearing `.optional()` INHERIT contracts (offerChoices/reactionsEnabled)
// against the boolean-default neighbour, and the toolRecurseLimit default-fill tail.

import { describe } from "vitest";
import {
  getGroupConfig,
  getRoomOverrides,
  getToolRecurseLimit,
  parseChatMetadata,
  TOOL_RECURSE_LIMIT_DEFAULT,
} from "../../../../../packages/server/src/domain/chat/contract/metadata.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("parseChatMetadata — fault isolation", () => {
  test("a malformed sub-blob heals to absent WITHOUT nuking its siblings", () => {
    const parsed = parseChatMetadata({
      group: { mode: "not-a-real-mode" }, // malformed
      toolRecurseLimit: 7, // valid sibling — must survive the group blob's failure
    });
    expect(parsed.group).toBeUndefined();
    expect(parsed.toolRecurseLimit).toBe(7);
  });

  test("the object itself is LOOSE — unknown future fields pass through unstripped", () => {
    const parsed = parseChatMetadata({ someFutureField: "kept" });
    expect((parsed as Record<string, unknown>)["someFutureField"]).toBe("kept");
  });

  test("null/non-object raw input is treated as an empty record, never throws", () => {
    expect(() => parseChatMetadata(null)).not.toThrow();
    expect(() => parseChatMetadata("garbage")).not.toThrow();
    expect(parseChatMetadata(undefined)).toEqual({});
  });

  test("absent ⇒ key MISSING, never an explicit `undefined` value (stripUndefined contract)", () => {
    const parsed = parseChatMetadata({});
    expect("group" in parsed).toBe(false);
    expect("offerChoices" in parsed).toBe(false);
  });

  test("offerChoices/reactionsEnabled: absent means INHERIT — a corrupt value heals to absent, not to a forced posture", () => {
    const parsed = parseChatMetadata({ offerChoices: "not-a-bool", charactersCanReact: "nope", reactionsEnabled: 5 });
    expect(parsed.offerChoices).toBeUndefined();
    expect(parsed.charactersCanReact).toBeUndefined();
    expect(parsed.reactionsEnabled).toBeUndefined();
  });
});

describe("getGroupConfig / getRoomOverrides — default fallbacks", () => {
  test("an absent/corrupt group blob falls back to DEFAULT_GROUP_CONFIG", () => {
    expect(getGroupConfig({})).toBeDefined();
    expect(getGroupConfig({ group: "garbage" })).toEqual(getGroupConfig({}));
  });

  test("an absent/corrupt roomOverrides blob falls back to DEFAULT_ROOM_OVERRIDES", () => {
    expect(getRoomOverrides({})).toBeDefined();
    expect(getRoomOverrides({ roomOverrides: "garbage" })).toEqual(getRoomOverrides({}));
  });
});

describe("getToolRecurseLimit", () => {
  test("an absent/corrupt limit falls back to the seed default (5)", () => {
    expect(getToolRecurseLimit({})).toBe(TOOL_RECURSE_LIMIT_DEFAULT);
    expect(getToolRecurseLimit({ toolRecurseLimit: 999 })).toBe(TOOL_RECURSE_LIMIT_DEFAULT); // out of 1..20 range → catch(undefined)
  });

  test("a valid in-range limit is honored", () => {
    expect(getToolRecurseLimit({ toolRecurseLimit: 10 })).toBe(10);
  });
});
