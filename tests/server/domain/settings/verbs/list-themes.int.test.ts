// verb: listThemes — owned ∪ seeds, as views; never another user's rows.

import { describe } from "vitest";
import { ensureSeedThemes } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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
    expect(names).toEqual(["Hearth", "Light", "Mine", "Mocha"]);
    expect(views.every((v) => v.name !== "Theirs")).toBe(true);
    expect(views.find((v) => v.name === "Hearth")?.isSeed).toBe(true);
    expect(views.find((v) => v.name === "Mine")?.isSeed).toBe(false);
  });
});
