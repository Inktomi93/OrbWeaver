// persistence/theme-queries — the `themes` table db layer (queries only). Asserts the owned ∪ seed read
// union, the `fetchOwned`-scoped write predicate (a seed's NULL owner never matches — the un-mutability
// invariant), the `(ownerId, name)` unique-constraint classification, and the
// idempotent + non-clobbering seed upsert.

import type { ThemeOverride } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  deleteOwnedTheme,
  insertTheme,
  isThemeNameConflict,
  listOwnedThemeNames,
  listReadableThemes,
  readableTheme,
  updateOwnedTheme,
  upsertSeedTheme,
} from "../../../../../packages/server/src/domain/settings/persistence/theme-queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;
const OVERRIDE: ThemeOverride = { accent: "oklch(0.7 0.14 250)" };

function themeId(n: number): ThemeId {
  return castId<ThemeId>(`theme_test${n}`);
}

async function insertOwned(db: Db, id: ThemeId, ownerId: UserId, name: string): Promise<void> {
  await insertTheme(db, {
    id,
    ownerId,
    name,
    override: OVERRIDE,
    css: null,
    createdAt: AT,
    updatedAt: AT,
  });
}

async function insertSeed(db: Db, id: ThemeId, name: string): Promise<void> {
  await upsertSeedTheme(db, {
    id,
    ownerId: null,
    name,
    override: OVERRIDE,
    css: null,
    createdAt: AT,
    updatedAt: AT,
  });
}

describe("listReadableThemes / readableTheme", () => {
  test("returns the caller's own themes PLUS every seed, never another user's", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await insertSeed(db, themeId(1), "Hearth");
    await insertOwned(db, themeId(2), a, "Mine");
    await insertOwned(db, themeId(3), b, "Theirs");

    const rows = await listReadableThemes(db, a);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["Hearth", "Mine"]);
  });

  test("readableTheme resolves own OR seed; never a foreign owner's row", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await insertSeed(db, themeId(1), "Hearth");
    await insertOwned(db, themeId(3), b, "Theirs");

    expect(await readableTheme(db, a, themeId(1))).toBeDefined();
    expect(await readableTheme(db, a, themeId(3))).toBeUndefined();
  });
});

describe("updateOwnedTheme / deleteOwnedTheme — seeds are un-mutable BY CONSTRUCTION", () => {
  test("updateOwnedTheme on a seed id matches nothing", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertSeed(db, themeId(1), "Hearth");
    const result = await updateOwnedTheme(db, themeId(1), a, { name: "Hacked", updatedAt: AT });
    expect(result).toBeUndefined();
  });

  test("deleteOwnedTheme on a seed id removes nothing", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertSeed(db, themeId(1), "Hearth");
    expect(await deleteOwnedTheme(db, themeId(1), a)).toBe(false);
    expect(await readableTheme(db, a, themeId(1))).toBeDefined(); // still there
  });

  test("updateOwnedTheme / deleteOwnedTheme work on the caller's own row", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertOwned(db, themeId(2), a, "Mine");
    const updated = await updateOwnedTheme(db, themeId(2), a, {
      name: "Renamed",
      updatedAt: AT + 1,
    });
    expect(updated?.name).toBe("Renamed");
    expect(await deleteOwnedTheme(db, themeId(2), a)).toBe(true);
  });
});

describe("isThemeNameConflict — the (ownerId, name) unique constraint", () => {
  test("a duplicate (ownerId, name) insert classifies as a unique conflict", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertOwned(db, themeId(2), a, "Mine");
    let caught: unknown;
    try {
      await insertOwned(db, themeId(3), a, "Mine");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isThemeNameConflict(caught)).toBe(true);
  });

  test("SQLite treats NULL owners as distinct — two seeds may not share a name only by coincidence", async () => {
    const db = await freshDb();
    // Two DIFFERENT seed names never collide (the seeder is the guard for the seed namespace).
    await insertSeed(db, themeId(1), "Hearth");
    await insertSeed(db, themeId(4), "Mocha");
    const rows = await listReadableThemes(db, await seedUser(db, { id: "user_a" }));
    expect(rows.map((r) => r.name).sort()).toEqual(["Hearth", "Mocha"]);
  });
});

describe("listOwnedThemeNames", () => {
  test("returns only the caller's own names (never seed names)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertSeed(db, themeId(1), "Hearth");
    await insertOwned(db, themeId(2), a, "Mine");
    expect(await listOwnedThemeNames(db, a)).toEqual(["Mine"]);
  });
});

describe("upsertSeedTheme — idempotent + non-clobbering", () => {
  test("a double-run leaves exactly one row per sentinel id, with the LATEST values", async () => {
    const db = await freshDb();
    await insertSeed(db, themeId(1), "Hearth");
    await upsertSeedTheme(db, {
      id: themeId(1),
      ownerId: null,
      name: "Hearth",
      override: { accent: "oklch(0.9 0.2 30)" },
      css: null,
      createdAt: AT,
      updatedAt: AT + 10,
    });
    const a = await seedUser(db, { id: "user_a" });
    const rows = await listReadableThemes(db, a);
    expect(rows.filter((r) => r.id === themeId(1))).toHaveLength(1);
    expect(rows.find((r) => r.id === themeId(1))?.override).toEqual({
      accent: "oklch(0.9 0.2 30)",
    });
  });

  test("re-seeding never touches a user-owned row of a different id", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertOwned(db, themeId(2), a, "Mine");
    await insertSeed(db, themeId(1), "Hearth");
    await insertSeed(db, themeId(1), "Hearth"); // re-seed
    const rows = await listReadableThemes(db, a);
    expect(rows.find((r) => r.id === themeId(2))?.name).toBe("Mine");
  });

  test("re-seeding never touches a user-owned row at the SAME id (the PK-collision arm)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { id: "user_a" });
    await insertOwned(db, themeId(1), a, "Mine");
    // The conflict target is the PK, which carries no owner — without the `ownerId IS NULL` bound on the
    // DO UPDATE arm the reseed overwrote this user's row in place while it kept its own ownerId.
    await insertSeed(db, themeId(1), "Hearth");
    const rows = await listReadableThemes(db, a);
    expect(rows.find((r) => r.id === themeId(1))?.name).toBe("Mine");
  });
});
