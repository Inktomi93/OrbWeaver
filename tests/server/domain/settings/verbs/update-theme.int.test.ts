// verb: updateTheme — patch an OWNED theme; a seed id 404s BY CONSTRUCTION (fetchOwned's NULL-owner
// predicate can never match); a taken name on rename throws DomainConflictError.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { ThemeNotFoundError } from "../../../../../packages/server/src/domain/settings/contract/errors.ts";
import { ensureSeedThemes } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { findSeedTheme, makeHarness, principal, seedUser } from "../_support.ts";

describe("updateTheme", () => {
  test("patches an owned theme's name + override", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const created = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    const updated = await h.svc.updateTheme({
      principal: principal(a, "user"),
      id: created.id,
      input: { name: "Renamed", override: { accent: "oklch(0.7 0.14 250)" } },
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.override).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });

  test("a seed id 404s (never editable in place)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });
    const hearth = await findSeedTheme(h, a, "Hearth");
    await expect(
      h.svc.updateTheme({
        principal: principal(a, "user"),
        id: hearth.id,
        input: { name: "Hacked" },
      }),
    ).rejects.toThrow(ThemeNotFoundError);
  });

  test("another user's theme id 404s (no cross-user access)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    const created = await h.svc.createTheme({
      principal: principal(b, "user"),
      input: { name: "Theirs", override: {} },
    });
    await expect(
      h.svc.updateTheme({
        principal: principal(a, "user"),
        id: created.id,
        input: { name: "Hacked" },
      }),
    ).rejects.toThrow(ThemeNotFoundError);
  });

  test("renaming to a taken name throws DomainConflictError", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "First", override: {} },
    });
    const second = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Second", override: {} },
    });
    await expect(
      h.svc.updateTheme({
        principal: principal(a, "user"),
        id: second.id,
        input: { name: "First" },
      }),
    ).rejects.toThrow(DomainConflictError);
  });

  test("custom CSS with position: fixed is rejected on update too", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const created = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    await expect(
      h.svc.updateTheme({
        principal: principal(a, "user"),
        id: created.id,
        input: { css: ".x { position: sticky; }" },
      }),
    ).rejects.toThrow(DomainOperationError);
  });

  test("an untouched field survives a partial patch", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const created = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: { accent: "oklch(0.7 0.14 250)" } },
    });
    const updated = await h.svc.updateTheme({
      principal: principal(a, "user"),
      id: created.id,
      input: { name: "Renamed" },
    });
    expect(updated.override).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });
});
