// seed: ensureSeedThemes — the boot seeder for the seed palettes (the three base palettes + the ten
// default-character palettes). Pins: first boot inserts a null-owner row at every sentinel id in the
// SEED_THEMES registry; idempotent (a double-run leaves exactly the registry, no duplicates); a mutated
// seed row is RESTORED on the next boot (seeds are overwritten every boot, never version-gated —
// themes-design.md §5, un-editable-by-construction makes this safe); a user-owned row is never touched.

import { themes } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { THEME_HEARTH_ID, THEME_HEARTH_NAME, THEME_LIGHT_ID, THEME_MOCHA_ID } from "../../../../packages/server/src/domain/settings/constants.ts";
import { readableTheme } from "../../../../packages/server/src/domain/settings/persistence/theme-queries.ts";
import { ensureSeedThemes, SEED_THEMES } from "../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, makeHarness, principal, seedUser } from "./_support.ts";

describe("ensureSeedThemes", () => {
  test("first boot inserts every registered seed palette at its fixed sentinel id, owner-less", async () => {
    const db = await freshDb();
    await ensureSeedThemes(db, () => FROZEN_AT);
    const a = await seedUser(db, { id: "user_a" });
    const rows = await Promise.all(SEED_THEMES.map((t) => readableTheme(db, a, t.id)));
    expect(rows).toHaveLength(SEED_THEMES.length);
    for (const row of rows) {
      expect(row?.ownerId).toBeNull();
    }
    // The base trio is still addressable by its own sentinel (the ids are API, not incidental order).
    expect(rows.map((r) => r?.id)).toEqual(expect.arrayContaining([THEME_HEARTH_ID, THEME_MOCHA_ID, THEME_LIGHT_ID]));
  });

  test("is idempotent — a double-run leaves exactly the registry, no duplicates", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => FROZEN_AT);
    await ensureSeedThemes(db, () => FROZEN_AT + 999);
    const a = await seedUser(db, { id: "user_a" });
    const seeds = (await h.svc.listThemes({ principal: principal(a, "user") })).filter((v) => v.isSeed);
    expect(seeds).toHaveLength(SEED_THEMES.length);
  });

  test("a hand-mutated seed row is RESTORED (overwritten) on the next boot", async () => {
    const db = await freshDb();
    await ensureSeedThemes(db, () => FROZEN_AT);
    // Simulate an out-of-band DB edit (bypassing the domain — a seed's NULL owner makes it un-mutable
    // through the verb API, so this is the only way a seed row could ever drift).
    await db
      .update(themes)
      .set({ name: "Corrupted", override: { accent: "oklch(0 0 0)" } })
      .where(eq(themes.id, THEME_HEARTH_ID));
    await ensureSeedThemes(db, () => FROZEN_AT + 1);
    const a = await seedUser(db, { id: "user_a" });
    const row = await readableTheme(db, a, THEME_HEARTH_ID);
    expect(row?.name).toBe(THEME_HEARTH_NAME);
    expect(row?.override).not.toEqual({ accent: "oklch(0 0 0)" });
  });

  test("re-seeding never touches a user-owned theme", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const mine = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    await ensureSeedThemes(db, () => FROZEN_AT);
    const view = await h.svc.getTheme({ principal: principal(a, "user"), id: mine.id });
    expect(view.name).toBe("Mine");
  });
});
