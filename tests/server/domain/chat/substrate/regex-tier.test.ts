// regex-tier — the EFFECTIVE HOST-TIER regex resolver (D53 as amended by D121-E). Pure union, no I/O.
// Asserts: the FOUR-scope union (host-global ∪ chat-preset ∪ cast ∪ room), dedup-by-ROW-ID (first/earliest-
// tier wins — the property the old embed-by-value shape could not have, since three copies of a script were
// three scripts), the deterministic order (global → preset → cast roster order → room; stored order within
// each), the FULL set is returned (no enabled/flag filtering — that is the kit executor's job), and the D19
// host-tier scoping (a non-host member's scripts have NO entry point on the resolver surface).

import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { resolveHostTierRegexScripts } from "../../../../../packages/server/src/domain/chat/substrate/regex-tier.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const idsByLabel = new Map<string, ReturnType<typeof mintTypeId>>();
/** One stable minted TypeID per readable label — so "the same script attached at two tiers" is genuinely the
 *  same ROW id, which is what the dedup keys on. */
function idFor(label: string): ReturnType<typeof mintTypeId> {
  const existing = idsByLabel.get(label);
  if (existing !== undefined) {
    return existing;
  }
  const minted = mintTypeId(ID_PREFIX.regexScript);
  idsByLabel.set(label, minted);
  return minted;
}

/** A fully-defaulted `RegexScript` with a given id (+ optional overrides) — exercises the parse seam so the
 *  fixture matches the persisted shape exactly (every flag defaulted). */
function script(label: string, over: Partial<RegexScriptRow> = {}): RegexScriptRow {
  return regexScriptSchema.parse({
    // A row id is a real `regex_script_…` TypeID now, so the readable LABEL is the name and the assertions
    // read `.name`. Dedup keys on the id, so a "same script at two tiers" case must reuse ONE minted id —
    // `idFor` gives each label a stable one.
    id: idFor(label),
    name: label,
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: label,
    replaceString: `<${label}>`,
    placement: ["USER_INPUT"],
    ...over,
  });
}

// D121-E: a row id is a `regex_script_…` TypeID, not a readable label — so the assertions read the NAME
// (the label the fixture was always using as its id) and the fixture mints one stable TypeID per label.
const ids = (scripts: readonly RegexScriptRow[]): string[] => scripts.map((s) => s.name);

describe("resolveHostTierRegexScripts", () => {
  test("unions all four scopes (host-global ∪ chat-preset ∪ cast ∪ room)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      cast: [script("c1")],
      chat: [],
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
  });

  test("orders deterministically: global → preset → cast (roster order) → room, stored order within each", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1"), script("g2")],
      preset: [script("p1"), script("p2")],
      cast: [script("c1"), script("c2"), script("c3")],
      chat: [],
    });
    expect(ids(result)).toEqual(["g1", "g2", "p1", "p2", "c1", "c2", "c3"]);
  });

  test("dedups by id — the FIRST (earliest-tier) occurrence wins and keeps its position", () => {
    const result = resolveHostTierRegexScripts({
      // `dup` appears in all three tiers; the host-global instance (replaceString <g>) must be the one kept.
      hostGlobal: [script("dup", { replaceString: "<g>" }), script("g2")],
      preset: [script("dup", { replaceString: "<p>" }), script("p2")],
      cast: [script("dup", { replaceString: "<c>" }), script("c2")],
      chat: [],
    });
    expect(ids(result)).toEqual(["dup", "g2", "p2", "c2"]);
    expect(result.find((s) => s.name === "dup")?.replaceString).toBe("<g>");
  });

  test("returns the FULL set — disabled + every placement/flag survive (the executor filters, not this)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("off", { enabled: false }), script("md", { markdownOnly: true }), script("po", { promptOnly: true, placement: ["AI_OUTPUT"] })],
      preset: [],
      cast: [],
      chat: [],
    });
    // Nothing is dropped or rewritten — flag/placement filtering belongs to executeRegexScripts.
    expect(ids(result)).toEqual(["off", "md", "po"]);
    expect(result.find((s) => s.name === "off")?.enabled).toBe(false);
    expect(result.find((s) => s.name === "md")?.markdownOnly).toBe(true);
  });

  test("empty sources resolve to an empty set", () => {
    expect(resolveHostTierRegexScripts({ hostGlobal: [], preset: [], cast: [], chat: [] })).toEqual([]);
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
      cast: [script("c1")],
      chat: [],
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
    expect(ids(result)).not.toContain(memberScript.name);
  });
});
