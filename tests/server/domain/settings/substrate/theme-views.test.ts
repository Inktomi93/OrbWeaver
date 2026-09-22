// The `themes` row → view mapper (pure). Pins the three load-bearing read-seam behaviors:
//   1. `isSeed` is derived from `ownerId === null` (the client's un-owned-row signal, never a column).
//   2. `isDefault` is derived from the default palette's sentinel id — the flag the CLIENT reads to know
//      which card `theme.selectedThemeId: null` resolves to (#1671). It is pinned HERE, at the projection,
//      because this file is the only place that may know the sentinel: the client identifying that row any
//      other way is the #1667 defect (it compared the row's DISPLAY NAME to a mirrored literal, so a
//      rename silently left the Looks grid with no current card and the fold caption naming a stale look).
//      This suite replaces `tests/client/features/settings/lib/seed-theme-identity.test.ts`, which pinned
//      that mirror; the mirror is deleted, so its rungs move to what actually decides the answer now.
//   3. the LENIENT override parse: a garbage/hostile `override` blob degrades per-field to `{}` /
//      `undefined` rather than throwing (invariant 5 — a hand-corrupted blob reads as defaults).
//
// The flag's TOTALITY over writers needs no test: every verb returns `toThemeView(row)` and `ThemeView`
// declares `isDefault` REQUIRED, so a writer that skipped it would not compile.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { themes } from "@orb/db";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { THEME_HEARTH_ID } from "../../../../../packages/server/src/domain/settings/constants.ts";
import { SEED_THEMES } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { toThemeView } from "../../../../../packages/server/src/domain/settings/substrate/theme-views.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const FROZEN_AT = 1_750_000_000_000;
type ThemeRow = typeof themes.$inferSelect;

function row(overrides: Partial<ThemeRow> = {}): ThemeRow {
  return {
    id: castId<ThemeId>("theme_row"),
    ownerId: castId<UserId>("user_owner"),
    name: "Mine",
    override: { accent: "oklch(0.7 0.14 250)" } satisfies ThemeOverride,
    css: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}

describe("toThemeView — isSeed derivation", () => {
  test("an owned row is not a seed", () => {
    expect(toThemeView(row()).isSeed).toBe(false);
  });

  test("a null-owner row IS a seed", () => {
    expect(toThemeView(row({ ownerId: null })).isSeed).toBe(true);
  });
});

describe("toThemeView — isDefault derivation", () => {
  test("the default palette's sentinel row IS the default; any other row is not", () => {
    expect(toThemeView(row({ id: THEME_HEARTH_ID, ownerId: null })).isDefault).toBe(true);
    expect(toThemeView(row({ id: castId<ThemeId>("theme_00000000000000000000000002"), ownerId: null })).isDefault).toBe(false);
    expect(toThemeView(row()).isDefault).toBe(false); // an owned row can never be the default
  });

  test("EXACTLY ONE row of the shipped seed set projects isDefault — the picker's whole premise", () => {
    // The rung the deleted client-side pin walked: not "the constant matches", but "the row the SEEDER
    // actually writes is the one that comes back flagged". Two flagged rows would mark two current cards;
    // zero would mark none, which is the #1667 symptom.
    const flagged = SEED_THEMES.filter((seed) => toThemeView(row({ id: seed.id, ownerId: null, name: seed.name })).isDefault);
    expect(flagged.map((seed) => seed.id)).toEqual([THEME_HEARTH_ID]);
  });
});

describe("toThemeView — lenient override parse seam", () => {
  test("a valid override round-trips", () => {
    const view = toThemeView(row());
    expect(view.override).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });

  test("a hostile field degrades to undefined; the row is never rejected", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately hostile stored value past the wire type.
    // @orb-waive no-test-fabrication(any): deliberately corrupt persisted fields prove the lenient projection boundary; ends when the projection accepts unknown stored input directly.
    const corrupt = { accent: "javascript:alert(1)", font: "NotAllowlisted" } as any;
    const view = toThemeView(row({ override: corrupt }));
    expect(view.override.accent).toBeUndefined();
    expect(view.override.font).toBeUndefined();
  });

  test("a completely non-object override blob degrades to {} (never throws)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately hostile stored value past the wire type.
    // @orb-waive no-test-fabrication(any): deliberately non-object persisted data proves the lenient projection boundary; ends when the projection accepts unknown stored input directly.
    const view = toThemeView(row({ override: "not even an object" as any }));
    expect(view.override).toEqual({});
  });
});
