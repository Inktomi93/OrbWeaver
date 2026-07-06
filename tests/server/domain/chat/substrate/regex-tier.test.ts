// regex-tier — the EFFECTIVE HOST-TIER regex resolver (D53). Pure union, no I/O. Asserts: the three-source
// union (host-global ∪ chat-preset ∪ cast), dedup-by-id (first/earliest-tier wins), the deterministic order
// (global → preset → cast roster order; stored order within each), the FULL set is returned (no enabled/flag
// filtering — that is the kit executor's job), and the D19 host-tier scoping (a non-host member's scripts have
// NO entry point on the resolver surface, so they can never reach the shared set).

import type { CharacterCard } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import { describe } from "vitest";
import { resolveHostTierRegexScripts } from "../../../../../packages/server/src/domain/chat/substrate/regex-tier";
import { expect, test } from "../../../../support/fixtures";

/** A fully-defaulted `RegexScript` with a given id (+ optional overrides) — exercises the parse seam so the
 *  fixture matches the persisted shape exactly (every flag defaulted). */
function script(id: string, over: Partial<RegexScript> = {}): RegexScript {
  return regexScriptSchema.parse({
    id,
    name: id,
    findRegex: id,
    replaceString: `<${id}>`,
    placement: ["USER_INPUT"],
    ...over,
  });
}

/** A minimal `CharacterCard` carrying only the `regexScripts` under test (every other field at its null/empty
 *  identity — the resolver reads `.regexScripts` and nothing else). */
function card(regexScripts: RegexScript[]): CharacterCard {
  return {
    name: "C",
    description: null,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

const ids = (scripts: readonly RegexScript[]): string[] => scripts.map((s) => s.id);

describe("resolveHostTierRegexScripts", () => {
  test("unions all three sources (host-global ∪ chat-preset ∪ cast)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      cast: [card([script("c1")])],
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
  });

  test("orders deterministically: global → preset → cast (roster order), stored order within each", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1"), script("g2")],
      preset: [script("p1"), script("p2")],
      cast: [card([script("c1")]), card([script("c2"), script("c3")])],
    });
    expect(ids(result)).toEqual(["g1", "g2", "p1", "p2", "c1", "c2", "c3"]);
  });

  test("dedups by id — the FIRST (earliest-tier) occurrence wins and keeps its position", () => {
    const result = resolveHostTierRegexScripts({
      // `dup` appears in all three tiers; the host-global instance (replaceString <g>) must be the one kept.
      hostGlobal: [script("dup", { replaceString: "<g>" }), script("g2")],
      preset: [script("dup", { replaceString: "<p>" }), script("p2")],
      cast: [card([script("dup", { replaceString: "<c>" }), script("c2")])],
    });
    expect(ids(result)).toEqual(["dup", "g2", "p2", "c2"]);
    expect(result.find((s) => s.id === "dup")?.replaceString).toBe("<g>");
  });

  test("returns the FULL set — disabled + every placement/flag survive (the executor filters, not this)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [
        script("off", { enabled: false }),
        script("md", { markdownOnly: true }),
        script("po", { promptOnly: true, placement: ["AI_OUTPUT"] }),
      ],
      preset: [],
      cast: [],
    });
    // Nothing is dropped or rewritten — flag/placement filtering belongs to executeRegexScripts.
    expect(ids(result)).toEqual(["off", "md", "po"]);
    expect(result.find((s) => s.id === "off")?.enabled).toBe(false);
    expect(result.find((s) => s.id === "md")?.markdownOnly).toBe(true);
  });

  test("empty sources resolve to an empty set", () => {
    expect(resolveHostTierRegexScripts({ hostGlobal: [], preset: [], cast: [] })).toEqual([]);
  });

  test("D19 host-tier scoping: a non-host member's scripts have no entry point and never appear", () => {
    // A member's regex set is NOT a parameter on the resolver — the only inputs are the three HOST tiers
    // (host-global / chat-preset / host-owned cast). So whatever a member would carry, the effective set is
    // exactly the host union — the member-exclusion is structural (D53: a non-host member contributes no
    // shared-prompt regex).
    // `memberScript` is what a non-host member would carry — it is deliberately NOT passed to the resolver.
    const memberScript = script("member-only");
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      cast: [card([script("c1")])],
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
    expect(ids(result)).not.toContain(memberScript.id);
  });
});
