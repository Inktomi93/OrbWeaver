// seed: ensureSeedThemes — the boot CONVERGE for the seed palettes. Pins: first boot inserts a null-owner
// row at every sentinel id in the SEED_THEMES registry; idempotent (a double-run leaves exactly the
// registry, no duplicates); a mutated seed row is RESTORED on the next boot (seeds are overwritten every
// boot, never version-gated — un-editable-by-construction makes this safe); a user-owned row is never
// touched.
//
// Plus the RETIREMENT arm (TD/O-9): an install that already holds the ten default-character palettes must
// come out of the next boot without them — and without an orphaned `theme.selectedThemeId` pointing at one.
// The delete is the reason the retired sentinel ids are still spelled in constants.ts; without it every
// existing install keeps ten picker rows forever, which is the failure this converge exists to prevent.

import { themes, userSettings } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  RETIRED_SEED_THEME_IDS,
  THEME_HEARTH_ID,
  THEME_HEARTH_NAME,
  THEME_LIGHT_ID,
  THEME_MOCHA_ID,
} from "../../../../packages/server/src/domain/settings/constants.ts";
import { readableTheme } from "../../../../packages/server/src/domain/settings/persistence/theme-queries.ts";
import { ensureSeedThemes, SEED_THEMES } from "../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
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

  test("the shipped set is the D62 three — a retired palette is not seeded", async () => {
    const db = await freshDb();
    await ensureSeedThemes(db, () => FROZEN_AT);
    const a = await seedUser(db, { id: "user_a" });
    expect(SEED_THEMES.map((t) => t.name)).toEqual([THEME_HEARTH_NAME, "Mocha", "Light"]);
    const rows = await Promise.all(RETIRED_SEED_THEME_IDS.map((id) => readableTheme(db, a, id)));
    expect(rows, "no retired palette is seeded").toEqual(RETIRED_SEED_THEME_IDS.map(() => undefined));
  });

  test("an install holding the RETIRED palettes loses them on the next boot", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    // The pre-TD state: the ten character palettes seeded as owner-less rows.
    const retired = RETIRED_SEED_THEME_IDS[0];
    if (retired === undefined) {
      throw new Error("RETIRED_SEED_THEME_IDS must not be empty — the delete arm would be dead code");
    }
    await db.insert(themes).values(
      RETIRED_SEED_THEME_IDS.map((id, i) => ({
        id,
        ownerId: null,
        name: `Retired ${i}`,
        override: { accent: "oklch(0.7 0.14 250)" },
        css: null,
        createdAt: FROZEN_AT,
        updatedAt: FROZEN_AT,
      })),
    );

    await ensureSeedThemes(db, () => FROZEN_AT + 1);

    const rows = await Promise.all(RETIRED_SEED_THEME_IDS.map((id) => readableTheme(db, a, id)));
    expect(rows, "every retired palette is gone").toEqual(RETIRED_SEED_THEME_IDS.map(() => undefined));
    // …and the shipped set is intact (the delete is scoped to the retired ids, not "everything owner-less").
    expect(await readableTheme(db, a, THEME_HEARTH_ID)).toBeDefined();
  });

  test("a user's OWN duplicate of a retired palette survives the retirement", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    await db.insert(themes).values({
      id: RETIRED_SEED_THEME_IDS[0] ?? THEME_LIGHT_ID,
      ownerId: null,
      name: "Charlotte",
      override: { accent: "oklch(0.74 0.1 248)" },
      css: null,
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    // Duplicate-to-customize: THEIR row, holding the same palette.
    const mine = await h.svc.duplicateTheme({ principal: principal(a, "user"), id: RETIRED_SEED_THEME_IDS[0] ?? THEME_LIGHT_ID });

    await ensureSeedThemes(db, () => FROZEN_AT + 1);

    const view = await h.svc.getTheme({ principal: principal(a, "user"), id: mine.id });
    expect(view.name).toBe("Charlotte copy");
    expect(view.override).toEqual({ accent: "oklch(0.74 0.1 248)" });
  });

  test("a selection pointing at a retired palette HEALS to null (Hearth); other selections are untouched", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const doomed = await seedUser(db, { id: "user_doomed" });
    const keeper = await seedUser(db, { id: "user_keeper" });
    const retiredId = RETIRED_SEED_THEME_IDS[0];
    if (retiredId === undefined) {
      throw new Error("RETIRED_SEED_THEME_IDS must not be empty");
    }
    await db.insert(themes).values({
      id: retiredId,
      ownerId: null,
      name: "Charlotte",
      override: {},
      css: null,
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    await h.svc.updateUserSettingsSection({ principal: principal(doomed, "user"), input: { section: "theme", patch: { selectedThemeId: retiredId } } });
    await h.svc.updateUserSettingsSection({ principal: principal(keeper, "user"), input: { section: "theme", patch: { selectedThemeId: THEME_MOCHA_ID } } });

    await ensureSeedThemes(db, () => FROZEN_AT + 1);

    const healed = await h.svc.getUserSettings({ principal: principal(doomed, "user") });
    expect(healed.config.theme.selectedThemeId).toBeNull();
    const untouched = await h.svc.getUserSettings({ principal: principal(keeper, "user") });
    expect(untouched.config.theme.selectedThemeId).toBe(THEME_MOCHA_ID);
    // ONLY-IF-SET: the keeper's row was not rewritten at all (its updatedAt is still its own write's).
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, keeper));
    expect(rows[0]?.updatedAt).toBe(FROZEN_AT);
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
