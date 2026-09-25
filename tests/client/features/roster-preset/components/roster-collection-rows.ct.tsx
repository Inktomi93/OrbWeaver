// CT: the roster COLLECTION's rows — the config host's library, not the saved-rosters picker.
//
// ═══ #1838 · THE CENSUS LEFT THE TITLE LINE ══════════════════════════════════════════════════════════
// The row parked its census ("2 · 1 rule") in `LibraryRow.markers`, the TITLE line's trailing slot, which
// docks at the row's right edge. In the 307px LIST column that was merely tight; #1725 moved these rows
// into the 990px CONTENT pane and it became the same defect the tag rows carried — a name whose own count
// sits several hundred px away stops reading as that name's count (side-eye 2026-09-06 measured the twin
// at 84–86% ink-to-ink void). the mock design §3.3 draws the roster subtitle as "members · rules"; `rosterScent`
// is that string.
//
// WHAT IS PINNED, AND WHY EACH ARM EXISTS:
//   · the WIDTH MATRIX (the mock design §5 obligation 6) at all three `INK_VOID_WIDTHS` — a point measurement
//     never proves a range property, and this exact defect reads 48% at the narrow end and 86% at the wide
//     one, so either end alone would have been a false verdict about the other. The measurement is a
//     `Range` over the glyph runs, never a bounding box: a row title is `min-w-0 flex-1 truncate`, so its
//     BOX spans the row and `getBoundingClientRect` reports a clean 6px gap over an 848px hole.
//   · the ANATOMY: the census reads BELOW the title and at the same left edge. That is the board's
//     drawing asserted as geometry rather than as a slot name — it is what makes the count read as the
//     name's own at any pane width.
//   · the CONTENT: the census counts what the roster holds, in words, including the singular arms and the
//     absent-rules arm (a "0 rules" on every rule-less roster is a fact the reader discards per row).
//   · the SPOKEN row: `markers` and `subtitle` BOTH ride `aria-describedby`, so moving the census must not
//     silently change what a screen reader hears. It is one sentence now, and it still carries the counts.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { INK_VOID_BAR_PCT, INK_VOID_WIDTHS, inkVoid } from "../../../../support/browser/ink-void.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RosterCollectionRowsStory } from "../_ct-stories.tsx";

function member(id: string, name: string, position: number): RosterPresetSummary["members"][number] {
  return { characterId: castId<CharacterId>(id), position, talkativeness: null, disabled: false, name, avatarHash: null };
}

/** Three members and two rules — the plural arms of both halves of the scent. */
const PARTY: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_party"),
  name: "Adventuring Party",
  description: "",
  characterCount: 3,
  members: [member("character_ct_1", "Ash", 0), member("character_ct_2", "Brook", 1), member("character_ct_3", "Cinder", 2)],
  anchorPersonaId: null,
  hasGroupConfig: true,
  rules: [
    { rulePresetId: "sceneVeil", knobs: { veilWord: "((fade))", redirect: "cut" } },
    { rulePresetId: "pacingNudge", knobs: { everyN: 4, steer: "s" } },
  ],
  updatedAt: 1,
};

/** ONE member, ONE rule — the singular arms, which a naive `${n} members` gets wrong on both. */
const DUET: RosterPresetSummary = {
  ...PARTY,
  id: castId<RosterPresetId>("roster_preset_ct_duet"),
  name: "Book Club",
  characterCount: 1,
  members: [member("character_ct_4", "Dara", 0)],
  rules: [{ rulePresetId: "pacingNudge", knobs: { everyN: 8, steer: "s" } }],
};

/** NO rules — the common case, and the one that must contribute nothing rather than "0 rules". */
const QUIET: RosterPresetSummary = {
  ...PARTY,
  id: castId<RosterPresetId>("roster_preset_ct_quiet"),
  name: "Quiet Table",
  characterCount: 2,
  members: [member("character_ct_5", "Ember", 0), member("character_ct_6", "Fen", 1)],
  rules: [],
};

const ROSTERS = [PARTY, DUET, QUIET];

function stub(page: Page, rosters: readonly RosterPresetSummary[] = ROSTERS): Promise<unknown> {
  return routeTrpc(page, {
    "rosterPreset.list": () => rosters,
    "rosterPreset.remove": () => undefined,
  });
}

// ── The width matrix the mock design §5 obligation 6 owes every collection row ─────────────────────────────
for (const width of INK_VOID_WIDTHS) {
  test(`#1838: a roster row's ink-to-ink void stays inside the bar at ${String(width)}px`, async ({ mount, page }) => {
    await stub(page);
    const rows = await mount(<RosterCollectionRowsStory width={width} />);
    await expect(rows.getByText("Adventuring Party")).toBeVisible();

    for (const index of [0, 1, 2]) {
      const void_ = await inkVoid(page, index);
      expect(void_.runs, "a row must have rendered ink to measure").toBeGreaterThan(0);
      expect(void_.pct, `row ${String(index)} at ${String(void_.width)}px: widest ink gap ${String(void_.pct)}% ${void_.at}`).toBeLessThanOrEqual(
        INK_VOID_BAR_PCT,
      );
    }
  });
}

test("#1838: the census reads on the row's SUBTITLE line, under the name it counts", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<RosterCollectionRowsStory width={990} />);
  const row = rows.locator('[data-slot="list-row-root"]').first();

  // ONE poll returning a VERDICT OBJECT (the `ct-no-oneshot-live-read-assert` idiom): these are live layout
  // reads, so the assertion retries until the row has painted, and the failure output still names which
  // claim broke and at what pixels. On the pre-#1838 source the census sat on the title's line, at the
  // pane's right edge.
  await expect
    .poll(() =>
      row.evaluate((el: Element) => {
        const title = el.querySelector<HTMLElement>('[data-slot="list-row-title"]');
        const subtitle = el.querySelector<HTMLElement>('[data-slot="list-row-subtitle"]');
        if (title === null || subtitle === null) {
          throw new Error("the row is missing its title or its subtitle");
        }
        const t = title.getBoundingClientRect();
        const s = subtitle.getBoundingClientRect();
        return { text: subtitle.textContent ?? "", below: s.top >= t.bottom - 1, leftAligned: Math.abs(s.left - t.left) <= 1 };
      }),
    )
    .toMatchObject({ text: "3 characters · 2 rules · Ash, Brook, Cinder", below: true, leftAligned: true });
});

test("#1838: the scent counts in words — singular arms, and no zero-rules noise", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<RosterCollectionRowsStory width={990} />);
  await expect(rows.getByText("1 character · 1 rule · Dara")).toBeVisible();
  await expect(rows.getByText("2 characters · Ember, Fen")).toBeVisible();
  // The absent half is asserted as ABSENT, not merely un-asserted: "0 rules" on every rule-less roster is
  // the failure this arm exists to catch.
  await expect(rows.getByText("0 rules")).toHaveCount(0);
});

// THE SPOKEN ROW SURVIVED THE MOVE. `markers` and `subtitle` both ride `ListRow`'s `aria-describedby`, so
// a census that moved between them could silently change or drop what a screen reader hears — the tag
// rows' own re-verify caught exactly that class going the other way (a colour disclaimer recited per row).
test("#1838: the row's spoken DESCRIPTION is the scent, unchanged by the move", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<RosterCollectionRowsStory width={990} />);
  // `exact`: the row carries a kebab named "Actions for Adventuring Party", so a substring match resolves
  // to both. The ROW button's accessible name is exactly the roster's name.
  const row = rows.getByRole("button", { name: "Adventuring Party", exact: true });
  await expect(row).toHaveAccessibleDescription("3 characters · 2 rules · Ash, Brook, Cinder");
});

test("#1838: the host's filter string narrows the OWNER's rows", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<RosterCollectionRowsStory filter="book" width={990} />);
  await expect(rows.getByText("Book Club")).toBeVisible();
  await expect(rows.getByText("Adventuring Party")).toHaveCount(0);
});
