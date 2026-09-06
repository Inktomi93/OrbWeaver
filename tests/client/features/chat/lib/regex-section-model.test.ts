// The Regex section's one rendering decision, tested as the pure function it is (#1742): WHERE a script that
// two tiers of this room hold draws, and what the three counts say. Everything else in the section is the
// server's answer copied through (`docs/design/mocks/regex-section/DESIGN.md` §7.1 — the client never
// re-unions and never re-ranks), so there is nothing else here to test.
//
// The case that matters is the LAST one: the earliest tier switched OFF while a later one still runs the same
// script. That is the drop-before-dedup state the resolver exists for, and drawing the row at its earliest
// LISTING tier there would print `—` on a script that is running.

import type { RegexTierGroupView, RegexTierKey } from "@orb/contracts/chat";
import { characterRegexTierKey } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, RegexScriptId } from "@orb/kit/ids";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { describe } from "vitest";
import {
  regexRowAlsoAt,
  regexRowHomes,
  regexTierInForceCount,
  regexTierKicker,
  regexTierLabels,
  regexTierLever,
  regexTierLeverCount,
  regexTierProvenance,
  regexTierRows,
} from "../../../../../packages/client/src/features/chat/lib/regex-section-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A library row, spelled WHOLE against the contract (never a double cast — a fabricated row survives the
 *  schema gaining a field, `no-test-fabrication`). Only the branded id is cast, which is the one thing a
 *  literal cannot be. */
/** One seated character's tier key — minted through the contract's own function, never spelled here. */
const CHARACTER_TIER = characterRegexTierKey("character_x" as CharacterId);

function script(id: string, enabled = true): RegexScriptRow {
  return {
    id: id as RegexScriptId,
    name: id,
    enabled,
    updatedAt: 1_700_000_000_000,
    findRegex: "x",
    replaceString: "",
    placement: ["AI_OUTPUT"],
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
  };
}

function tier(
  scope: RegexTierKey,
  rows: readonly { readonly id: string; readonly runsAt: number | null; readonly enabled?: boolean }[],
  allowed = true,
): RegexTierGroupView {
  return {
    scope,
    allowed,
    rows: rows.map((row, position) => ({
      script: script(row.id, row.enabled ?? true),
      position,
      runsAt: row.runsAt,
      attachedElsewhere: false,
    })),
  };
}

describe("regexRowHomes", () => {
  test("a script two tiers hold draws ONCE, at the tier that claimed its rank", () => {
    const tiers = [tier("global", [{ id: "a", runsAt: 1 }]), tier("chat", [{ id: "a", runsAt: null }])];
    const homes = regexRowHomes(tiers);
    expect(homes.get("a" as RegexScriptId)).toBe("global");
    expect(regexTierRows(tiers[0] as RegexTierGroupView, homes).map((row) => row.script.id)).toEqual(["a"]);
    expect(regexTierRows(tiers[1] as RegexTierGroupView, homes)).toEqual([]);
  });

  test("with the EARLIEST tier off, the row draws at the later tier that actually runs it (rank kept)", () => {
    const tiers = [tier("global", [{ id: "a", runsAt: null }], false), tier("chat", [{ id: "a", runsAt: 1 }])];
    const homes = regexRowHomes(tiers);
    expect(homes.get("a" as RegexScriptId)).toBe("chat");
    expect(regexTierRows(tiers[1] as RegexTierGroupView, homes)[0]?.runsAt).toBe(1);
  });

  test("with NOTHING running (the master off), the row still draws — at its earliest listing tier", () => {
    const tiers = [tier("global", [{ id: "a", runsAt: null }]), tier("chat", [{ id: "a", runsAt: null }])];
    expect(regexRowHomes(tiers).get("a" as RegexScriptId)).toBe("global");
  });
});

test("the +N chip names every OTHER tier of this room holding the row", () => {
  const tiers = [tier("global", [{ id: "a", runsAt: 1 }]), tier(CHARACTER_TIER, [{ id: "a", runsAt: null }]), tier("chat", [{ id: "a", runsAt: null }])];
  expect(regexRowAlsoAt(tiers, "a" as RegexScriptId, "global")).toEqual([CHARACTER_TIER, "chat"]);
});

describe("the two counts say different things", () => {
  const rows = tier("preset", [
    { id: "a", runsAt: null, enabled: true },
    { id: "b", runsAt: null, enabled: false },
  ]).rows;

  test("the GROUP count is what runs here — zero for a tier switched off", () => {
    expect(regexTierInForceCount(rows)).toBe(0);
  });

  test("the LEVER count is what the tier holds enabled — never zero just because the lever is off", () => {
    expect(regexTierLeverCount(rows)).toBe(1);
  });
});

describe("tier labels", () => {
  const seats = new Map<CharacterId, string>([["character_x" as CharacterId, "Bo"]]);
  /** The two label sources joined as the section joins them (#1754): the WIRE names the preset tier, the
   *  ROSTER names a seat by the id that seat's own key carries. */
  const labels = regexTierLabels([{ ...tier("preset", []), label: "Grimdark GM" }, tier(CHARACTER_TIER, [])], seats);

  test("a seat is named by its own id, in all three voices", () => {
    expect(regexTierLever(CHARACTER_TIER, labels)).toBe("Bo");
    expect(regexTierKicker(CHARACTER_TIER, labels)).toBe("From Bo");
    expect(regexTierProvenance(CHARACTER_TIER, labels)).toBe("Came with Bo’s card.");
  });

  test("the preset tier is named by the WIRE — the one name the client cannot derive (#1754)", () => {
    expect(regexTierLever("preset", labels)).toBe("Preset · Grimdark GM");
    expect(regexTierKicker("preset", labels)).toBe("From the preset · Grimdark GM");
  });

  test("with no wire label the preset tier says the bare word rather than guessing", () => {
    const unnamed = regexTierLabels([tier("preset", [])], seats);
    expect(regexTierLever("preset", unnamed)).toBe("Preset");
    expect(regexTierKicker("preset", unnamed)).toBe("From the preset");
  });

  test("a seat that left between the two reads degrades to a word, never a raw id (R10)", () => {
    const orphan = regexTierLabels([tier(CHARACTER_TIER, [])], new Map<CharacterId, string>());
    expect(regexTierKicker(CHARACTER_TIER, orphan)).toBe("From a character");
  });

  test("the two scope words are the pane's own (`Everywhere` / `This chat`)", () => {
    expect(regexTierLever("global", labels)).toBe("Everywhere");
    expect(regexTierLever("chat", labels)).toBe("This chat");
  });
});
