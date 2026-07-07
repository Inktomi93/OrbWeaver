// The `themes` row → view mapper (pure). Pins the two load-bearing read-seam behaviors:
//   1. `isSeed` is derived from `ownerId === null` (the client's un-owned-row signal, never a column).
//   2. the LENIENT override parse: a garbage/hostile `override` blob degrades per-field to `{}` /
//      `undefined` rather than throwing (invariant 5 — a hand-corrupted blob reads as defaults).

import type { ThemeOverride } from "@orb/contracts/theme";
import type { themes } from "@orb/db";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { toThemeView } from "../../../../../packages/server/src/domain/settings/substrate/theme-views.ts";
import { expect, test } from "../../../../support/fixtures";

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

describe("toThemeView — lenient override parse seam", () => {
  test("a valid override round-trips", () => {
    const view = toThemeView(row());
    expect(view.override).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });

  test("a hostile field degrades to undefined; the row is never rejected", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately hostile stored value past the wire type.
    const corrupt = { accent: "javascript:alert(1)", font: "NotAllowlisted" } as any;
    const view = toThemeView(row({ override: corrupt }));
    expect(view.override.accent).toBeUndefined();
    expect(view.override.font).toBeUndefined();
  });

  test("a completely non-object override blob degrades to {} (never throws)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately hostile stored value past the wire type.
    const view = toThemeView(row({ override: "not even an object" as any }));
    expect(view.override).toEqual({});
  });
});
