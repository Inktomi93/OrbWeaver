// verb: duplicateTheme — copy-to-customize. Source = any readable row (own or seed) → a NEW owned row;
// name defaults to "<source> copy", de-duped by numeric suffix against the caller's own names.

import { describe } from "vitest";
import { ThemeNotFoundError } from "../../../../../packages/server/src/domain/settings/contract/errors.ts";
import { ensureSeedThemes } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { findSeedTheme, makeHarness, principal, seedUser } from "../_support.ts";

describe("duplicateTheme", () => {
  test("duplicating a seed makes a NEW owned copy (isSeed: false, deep-copied override)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });
    const hearth = await findSeedTheme(h, a, "Hearth");
    const copy = await h.svc.duplicateTheme({ principal: principal(a, "user"), id: hearth.id });
    expect(copy.id).not.toBe(hearth.id);
    expect(copy.name).toBe("Hearth copy");
    expect(copy.isSeed).toBe(false);
    expect(copy.override).toEqual(hearth.override);
  });

  test("duplicating with a taken default name de-dupes by numeric suffix", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const source = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    const first = await h.svc.duplicateTheme({ principal: principal(a, "user"), id: source.id });
    const second = await h.svc.duplicateTheme({ principal: principal(a, "user"), id: source.id });
    expect(first.name).toBe("Mine copy");
    expect(second.name).toBe("Mine copy 2");
  });

  test("an explicit name is honored (still de-duped if taken)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const source = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    const copy = await h.svc.duplicateTheme({
      principal: principal(a, "user"),
      id: source.id,
      name: "Custom Name",
    });
    expect(copy.name).toBe("Custom Name");
  });

  test("duplicating another user's OWNED (non-seed) theme 404s", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    const theirs = await h.svc.createTheme({
      principal: principal(b, "user"),
      input: { name: "Theirs", override: {} },
    });
    await expect(
      h.svc.duplicateTheme({ principal: principal(a, "user"), id: theirs.id }),
    ).rejects.toThrow(ThemeNotFoundError);
  });
});
