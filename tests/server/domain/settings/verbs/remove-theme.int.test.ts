// verb: removeTheme — delete an OWNED theme; a seed id 404s BY CONSTRUCTION (never removable).

import { describe } from "vitest";
import { ThemeNotFoundError } from "../../../../../packages/server/src/domain/settings/contract/errors.ts";
import { ensureSeedThemes } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("removeTheme", () => {
  test("removes an owned theme + audits theme.remove", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const created = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    await h.svc.removeTheme({ principal: principal(a, "user"), id: created.id });
    await expect(
      h.svc.getTheme({ principal: principal(a, "user"), id: created.id }),
    ).rejects.toThrow(ThemeNotFoundError);
    expect(h.audits.some((a2) => a2.entry.action === "theme.remove")).toBe(true);
  });

  test("a seed id 404s (never removable)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });
    const seeds = await h.svc.listThemes({ principal: principal(a, "user") });
    const hearth = seeds.find((s) => s.name === "Hearth");
    if (hearth === undefined) {
      throw new Error("unreachable");
    }
    await expect(
      h.svc.removeTheme({ principal: principal(a, "user"), id: hearth.id }),
    ).rejects.toThrow(ThemeNotFoundError);
    // Still there, for owner and admin alike.
    const stillThere = await h.svc.getTheme({ principal: principal(a, "user"), id: hearth.id });
    expect(stillThere.name).toBe("Hearth");
  });

  test("another user's theme id 404s (no cross-user access)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    const theirs = await h.svc.createTheme({
      principal: principal(b, "user"),
      input: { name: "Theirs", override: {} },
    });
    await expect(
      h.svc.removeTheme({ principal: principal(a, "user"), id: theirs.id }),
    ).rejects.toThrow(ThemeNotFoundError);
  });
});
