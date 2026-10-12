// verb: getTheme — one theme readable by this owner (own or seed); ThemeNotFoundError for missing/foreign.
// @subject packages/server/src/domain/settings/verbs/get-theme.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { ThemeNotFoundError } from "#server/domain/settings/contract/errors.ts";
import { ensureSeedThemes } from "#server/domain/settings/seed-themes.ts";
import { findSeedTheme, makeHarness, principal, seedUser } from "../_support.ts";

describe("getTheme", () => {
  test("resolves the caller's own theme", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const created = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    const view = await h.svc.getTheme({ principal: principal(a, "user"), id: created.id });
    expect(view.name).toBe("Mine");
  });

  test("resolves a seed palette (isSeed: true)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });
    const hearth = await findSeedTheme(h, a, "Hearth");
    const view = await h.svc.getTheme({ principal: principal(a, "user"), id: hearth.id });
    expect(view.isSeed).toBe(true);
  });

  test("throws ThemeNotFoundError for another user's theme (no existence oracle)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    const created = await h.svc.createTheme({
      principal: principal(b, "user"),
      input: { name: "Theirs", override: {} },
    });
    await expect(h.svc.getTheme({ principal: principal(a, "user"), id: created.id })).rejects.toThrow(ThemeNotFoundError);
  });
});
