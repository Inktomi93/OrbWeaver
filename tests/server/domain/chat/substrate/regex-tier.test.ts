// regex-tier — the EFFECTIVE HOST-TIER regex resolver (D53 as amended by D121-E). Pure union, no I/O.
// Asserts: the FOUR-scope union (host-global ∪ chat-preset ∪ character ∪ room), dedup-by-ROW-ID (first/earliest-
// tier wins — the property the old embed-by-value shape could not have, since three copies of a script were
// three scripts), the deterministic order (global → preset → character roster order → room; stored order within
// each), the FULL set is returned (no enabled/flag filtering — that is the kit executor's job), and the D19
// host-tier scoping (a non-host member's scripts have NO entry point on the resolver surface).

import type { CharacterRegexSlice, RegexTierAllow } from "@orb/contracts/chat";
import { characterRegexTierKey } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { HostTierRegexSources, RegexTierLabels } from "../../../../../packages/server/src/domain/chat/contract/regex.ts";
import { resolveHostTierRegexScripts, resolveRegexTiers } from "../../../../../packages/server/src/domain/chat/substrate/regex-tier.ts";
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

/** Two stable seat ids — the character tier is PER SEAT (#1742/F3), so a fixture has to name whose rows
 *  it is handing over. */
const ARIA = mintTypeId(ID_PREFIX.character) as CharacterId;
const BRIN = mintTypeId(ID_PREFIX.character) as CharacterId;

function seat(characterId: CharacterId, scripts: readonly RegexScriptRow[]): CharacterRegexSlice {
  return { characterId, scripts };
}

/** A room that never touched the Regex section: no master, no tier flags ⇒ EVERYTHING runs. Every pre-#1742
 *  assertion in this file is taken under it, which is the byte-identical claim. */
const ALLOW_ALL: HostTierRegexSources["allow"] = { enabled: undefined, tiers: undefined };

/** #1754 — "this caller names nothing", the arm the TURN path takes: the listing is discarded there, so a
 *  name would be a value nobody renders. Every allow/dedup pin below is about run order, not naming. */
const UNNAMED: RegexTierLabels = { preset: null };

/** A room with named tiers switched off. */
function allowWithout(...off: readonly string[]): HostTierRegexSources["allow"] {
  const tiers: RegexTierAllow = {};
  for (const key of off) {
    (tiers as Record<string, boolean>)[key] = false;
  }
  return { enabled: undefined, tiers };
}

// D121-E: a row id is a `regex_script_…` TypeID, not a readable label — so the assertions read the NAME
// (the label the fixture was always using as its id) and the fixture mints one stable TypeID per label.
const ids = (scripts: readonly RegexScriptRow[]): string[] => scripts.map((s) => s.name);

describe("resolveHostTierRegexScripts", () => {
  test("unions all four scopes (host-global ∪ chat-preset ∪ character ∪ room)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      character: [seat(ARIA, [script("c1")])],
      chat: [],
      allow: ALLOW_ALL,
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
  });

  test("orders deterministically: global → preset → character (roster order) → room, stored order within each", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1"), script("g2")],
      preset: [script("p1"), script("p2")],
      character: [seat(ARIA, [script("c1"), script("c2")]), seat(BRIN, [script("c3")])],
      chat: [],
      allow: ALLOW_ALL,
    });
    expect(ids(result)).toEqual(["g1", "g2", "p1", "p2", "c1", "c2", "c3"]);
  });

  test("dedups by id — the FIRST (earliest-tier) occurrence wins and keeps its position", () => {
    const result = resolveHostTierRegexScripts({
      // `dup` appears in all three tiers; the host-global instance (replaceString <g>) must be the one kept.
      hostGlobal: [script("dup", { replaceString: "<g>" }), script("g2")],
      preset: [script("dup", { replaceString: "<p>" }), script("p2")],
      character: [seat(ARIA, [script("dup", { replaceString: "<c>" }), script("c2")])],
      chat: [],
      allow: ALLOW_ALL,
    });
    expect(ids(result)).toEqual(["dup", "g2", "p2", "c2"]);
    expect(result.find((s) => s.name === "dup")?.replaceString).toBe("<g>");
  });

  test("returns the FULL set — disabled + every placement/flag survive (the executor filters, not this)", () => {
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("off", { enabled: false }), script("md", { markdownOnly: true }), script("po", { promptOnly: true, placement: ["AI_OUTPUT"] })],
      preset: [],
      character: [],
      chat: [],
      allow: ALLOW_ALL,
    });
    // Nothing is dropped or rewritten — flag/placement filtering belongs to executeRegexScripts.
    expect(ids(result)).toEqual(["off", "md", "po"]);
    expect(result.find((s) => s.name === "off")?.enabled).toBe(false);
    expect(result.find((s) => s.name === "md")?.markdownOnly).toBe(true);
  });

  test("empty sources resolve to an empty set", () => {
    expect(resolveHostTierRegexScripts({ hostGlobal: [], preset: [], character: [], chat: [], allow: ALLOW_ALL })).toEqual([]);
  });

  test("D19 host-tier scoping: a non-host member's scripts have no entry point and never appear", () => {
    // A member's regex set is NOT a parameter on the resolver — the only inputs are the three HOST tiers
    // (host-global / chat-preset / host-owned character). So whatever a member would carry, the effective set is
    // exactly the host union — the member-exclusion is structural (D53: a non-host member contributes no
    // shared-prompt regex).
    // `memberScript` is what a non-host member would carry — it is deliberately NOT passed to the resolver.
    const memberScript = script("member-only");
    const result = resolveHostTierRegexScripts({
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      character: [seat(ARIA, [script("c1")])],
      chat: [],
      allow: ALLOW_ALL,
    });
    expect(ids(result)).toEqual(["g1", "p1", "c1"]);
    expect(ids(result)).not.toContain(memberScript.name);
  });
});

// ── #1742 — the room's own levers (`docs/design/mocks/regex-section/DESIGN.md` §3/§7) ────────────────
describe("resolveRegexTiers — the room's per-chat allows", () => {
  test("a tier switch removes exactly that tier's rows from the effective set, and nothing else's", () => {
    const sources: HostTierRegexSources = {
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      character: [seat(ARIA, [script("c1")])],
      chat: [script("r1")],
      allow: allowWithout("preset"),
    };
    expect(ids(resolveHostTierRegexScripts(sources))).toEqual(["g1", "c1", "r1"]);
    // The rows are still LISTED — a host cannot switch back on what the read stopped mentioning — and their
    // ranks drop out, because a rank is a claim about the run order.
    const view = resolveRegexTiers(sources, UNNAMED);
    const preset = view.tiers.find((t) => t.scope === "preset");
    expect(preset?.allowed).toBe(false);
    expect(preset?.rows.map((r) => r.script.name)).toEqual(["p1"]);
    expect(preset?.rows.map((r) => r.runsAt)).toEqual([null]);
    // and the ranks of what DOES run are 1..n with no gap where the dropped tier was.
    expect(view.effective.map((e) => e.runsAt)).toEqual([1, 2, 3]);
  });

  test("the MASTER off empties the effective set entirely and leaves every row listed with a null rank", () => {
    const sources: HostTierRegexSources = {
      hostGlobal: [script("g1")],
      preset: [],
      character: [],
      chat: [script("r1")],
      allow: { enabled: false, tiers: undefined },
    };
    const view = resolveRegexTiers(sources, UNNAMED);
    expect(view.enabled).toBe(false);
    expect(view.effective).toEqual([]);
    expect(resolveHostTierRegexScripts(sources)).toEqual([]);
    expect(view.tiers.flatMap((t) => t.rows.map((r) => r.script.name))).toEqual(["g1", "r1"]);
    expect(view.tiers.flatMap((t) => t.rows.map((r) => r.runsAt))).toEqual([null, null]);
    // Every tier still reads as ALLOWED: the master is a separate lever, and conflating the two would make
    // the section redraw four switches the host never touched.
    expect(view.tiers.every((t) => t.allowed)).toBe(true);
  });

  test("PER-SEAT allows: switching one character's tier off leaves the other seat's rows running", () => {
    const sources: HostTierRegexSources = {
      hostGlobal: [],
      preset: [],
      character: [seat(ARIA, [script("aria-1")]), seat(BRIN, [script("brin-1")])],
      chat: [],
      allow: allowWithout(characterRegexTierKey(ARIA)),
    };
    expect(ids(resolveHostTierRegexScripts(sources))).toEqual(["brin-1"]);
    expect(resolveRegexTiers(sources, UNNAMED).tiers.map((t) => t.allowed)).toEqual([true, true, false, true, true]);
  });

  test("THE DROP HAPPENS BEFORE THE DEDUP: a script attached at a disallowed tier AND an allowed one still runs", () => {
    // The whole reason the order matters. `dup` sits in the (switched-off) preset tier and in the room's own
    // tier. Dropping after the dedup would let the preset occurrence swallow it and kill a script the host
    // never switched off — a silent, unexplainable death on the one surface built to explain them.
    const sources: HostTierRegexSources = {
      hostGlobal: [],
      preset: [script("dup", { replaceString: "<p>" })],
      character: [],
      chat: [script("dup", { replaceString: "<r>" })],
      allow: allowWithout("preset"),
    };
    const result = resolveHostTierRegexScripts(sources);
    expect(ids(result)).toEqual(["dup"]);
    expect(result[0]?.replaceString).toBe("<r>");
    const view = resolveRegexTiers(sources, UNNAMED);
    // The rank is drawn at the tier that CLAIMED it (the room's), not at the switched-off one.
    expect(view.tiers.find((t) => t.scope === "preset")?.rows[0]?.runsAt).toBeNull();
    expect(view.tiers.find((t) => t.scope === "chat")?.rows[0]?.runsAt).toBe(1);
  });

  test("dedup shows a script ONCE at its earliest tier — the later occurrence keeps the chip, loses the rank", () => {
    const view = resolveRegexTiers(
      {
        hostGlobal: [script("dup")],
        preset: [],
        character: [seat(ARIA, [script("dup")])],
        chat: [],
        allow: ALLOW_ALL,
      },
      UNNAMED,
    );
    expect(view.effective.map((e) => e.runsAt)).toEqual([1]);
    expect(view.tiers.find((t) => t.scope === "global")?.rows[0]?.runsAt).toBe(1);
    expect(view.tiers.find((t) => t.scope === characterRegexTierKey(ARIA))?.rows[0]?.runsAt).toBeNull();
    // BOTH occurrences carry `attachedElsewhere` — the `+1` chip is a fact about the ROW in this room, not
    // about which of its two homes you happen to be looking at.
    expect(view.tiers.flatMap((t) => t.rows.map((r) => r.attachedElsewhere))).toEqual([true, true]);
  });

  test("a row attached at exactly one tier is NOT `attachedElsewhere` (the detach toast's own gate)", () => {
    const view = resolveRegexTiers({ hostGlobal: [], preset: [], character: [], chat: [script("only-here")], allow: ALLOW_ALL }, UNNAMED);
    expect(view.tiers.find((t) => t.scope === "chat")?.rows[0]?.attachedElsewhere).toBe(false);
  });

  test("RUN ORDER IS DISPLAY ORDER: the tiers come back in the order the executor applies them", () => {
    const view = resolveRegexTiers(
      {
        hostGlobal: [script("g1")],
        preset: [script("p1")],
        character: [seat(ARIA, [script("a1")]), seat(BRIN, [script("b1")])],
        chat: [script("r1")],
        allow: ALLOW_ALL,
      },
      UNNAMED,
    );
    expect(view.tiers.map((t) => t.scope)).toEqual(["global", "preset", characterRegexTierKey(ARIA), characterRegexTierKey(BRIN), "chat"]);
    // The ranks read top-to-bottom down the drawn section with no re-sort on the client.
    expect(view.tiers.flatMap((t) => t.rows.map((r) => r.runsAt))).toEqual([1, 2, 3, 4, 5]);
    // and the effective half agrees with the rows the turn will run, in the same order.
    expect(view.effective.map((e) => e.scriptId)).toEqual(
      resolveHostTierRegexScripts({
        hostGlobal: [script("g1")],
        preset: [script("p1")],
        character: [seat(ARIA, [script("a1")]), seat(BRIN, [script("b1")])],
        chat: [script("r1")],
        allow: ALLOW_ALL,
      }).map((s) => s.id),
    );
  });

  test("an EMPTY tier still lists (the section draws its empty state) and a preset-less room has an empty preset tier", () => {
    const view = resolveRegexTiers({ hostGlobal: [], preset: [], character: [], chat: [], allow: ALLOW_ALL }, UNNAMED);
    expect(view.tiers.map((t) => t.scope)).toEqual(["global", "preset", "chat"]);
    expect(view.tiers.every((t) => t.rows.length === 0)).toBe(true);
    expect(view.enabled).toBe(true);
  });

  // ── #1754 — the naming half ─────────────────────────────────────────────────────────────────────────
  test("the caller's preset NAME lands on the preset tier and on no other", () => {
    const view = resolveRegexTiers(
      { hostGlobal: [script("g1")], preset: [script("p1")], character: [seat(ARIA, [script("c1")])], chat: [script("r1")], allow: ALLOW_ALL },
      { preset: "Grimdark GM" },
    );
    expect(view.tiers.find((t) => t.scope === "preset")?.label).toBe("Grimdark GM");
    // The other three keys carry their own identity, so the wire says nothing about them — a label there
    // would be a second, drift-prone spelling of `Everywhere` / the seat name / `This chat`.
    expect(view.tiers.filter((t) => t.scope !== "preset").map((t) => t.label)).toEqual([undefined, undefined, undefined]);
  });

  test("an UNNAMED preset leaves the key ABSENT — the section says the bare word, never a placeholder", () => {
    const view = resolveRegexTiers({ hostGlobal: [], preset: [script("p1")], character: [], chat: [], allow: ALLOW_ALL }, UNNAMED);
    const preset = view.tiers.find((t) => t.scope === "preset");
    expect(preset?.label).toBeUndefined();
    expect(Object.hasOwn(preset ?? {}, "label")).toBe(false);
  });

  test("a name never touches the RUN ORDER — the effective half is byte-identical named or not", () => {
    const sources: HostTierRegexSources = {
      hostGlobal: [script("g1")],
      preset: [script("p1")],
      character: [seat(ARIA, [script("c1")])],
      chat: [script("r1")],
      allow: allowWithout("preset"),
    };
    expect(resolveRegexTiers(sources, { preset: "Grimdark GM" }).effective).toEqual(resolveRegexTiers(sources, UNNAMED).effective);
  });

  test("an ABSENT allow blob is byte-identical to everything switched on (an existing room is unchanged)", () => {
    const rows = { hostGlobal: [script("g1")], preset: [script("p1")], character: [seat(ARIA, [script("c1")])], chat: [script("r1")] };
    const absent = resolveHostTierRegexScripts({ ...rows, allow: { enabled: undefined, tiers: undefined } });
    const explicit = resolveHostTierRegexScripts({
      ...rows,
      allow: { enabled: true, tiers: { global: true, preset: true, chat: true, [characterRegexTierKey(ARIA)]: true } },
    });
    expect(ids(absent)).toEqual(ids(explicit));
    expect(ids(absent)).toEqual(["g1", "p1", "c1", "r1"]);
  });
});
