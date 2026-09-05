// verb: listThemes — owned ∪ seeds, as views; never another user's rows.

import { describe } from "vitest";
import { THEME_HEARTH_ID } from "../../../../../packages/server/src/domain/settings/constants.ts";
import { ensureSeedThemes, SEED_THEMES } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("listThemes", () => {
  test("returns the caller's own themes PLUS every seed, never another user's", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    await h.svc.createTheme({
      principal: principal(b, "user"),
      input: { name: "Theirs", override: {} },
    });

    const views = await h.svc.listThemes({ principal: principal(a, "user") });
    const names = views.map((v) => v.name).sort();
    // Every seed palette in the registry (base trio + the default-character palettes) plus the caller's own.
    expect(names).toEqual([...SEED_THEMES.map((t) => t.name), "Mine"].sort((x, y) => x.localeCompare(y)));
    expect(views.every((v) => v.name !== "Theirs")).toBe(true);
    expect(views.find((v) => v.name === "Hearth")?.isSeed).toBe(true);
    expect(views.find((v) => v.name === "Mine")?.isSeed).toBe(false);
    // …and EXACTLY ONE row of the collection the client actually receives is flagged default (#1671) —
    // asserted here, past the real seeder + the real read, keyed by the SEEDER'S id rather than by the
    // display name the client used to compare against (#1667).
    const flagged = views.filter((v) => v.isDefault);
    expect(flagged.map((v) => v.id)).toEqual([THEME_HEARTH_ID]);
  });
});
