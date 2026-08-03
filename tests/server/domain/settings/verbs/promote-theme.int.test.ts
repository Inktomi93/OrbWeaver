// verb: promoteTheme — the PROMOTE door (TD door 1): a character card's authored look becomes an owned
// library row. Three properties carry the whole design and each is a live defect if it breaks:
//   • the payload is the CARD-EMBEDDABLE subset — a promoted theme must not smuggle a viewer-force the card
//     could not exert (a stale `density` would silently pin the promoting user's shell density);
//   • the name DE-COLLIDES at the mint — this door derives its default (the character's name), so a second
//     promote of the same character must land as "Aria 2", not fail in the user's face;
//   • the row is OWNED, never a seed — `isSeed` derives from a NULL owner, so a promote that wrote one
//     would mint an un-deletable, un-editable palette (D71).

import { describe } from "vitest";
import { ensureSeedThemes } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const CARD_LOOK = {
  accent: "oklch(0.74 0.1 248)",
  aiBubble: { bg: "oklch(0.21 0.012 255)", fg: "oklch(0.95 0.008 255)" },
  speaker: "oklch(0.74 0.1 248)",
  background: "oklch(0.15 0.012 255)",
  font: "Georgia",
  radius: "full",
} as const;

describe("promoteTheme", () => {
  test("copies the card's look into a new OWNED row named for the character", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });

    const promoted = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Charlotte", override: { ...CARD_LOOK } } });

    expect(promoted.name).toBe("Charlotte");
    expect(promoted.isSeed).toBe(false);
    expect(promoted.css).toBeNull();
    expect(promoted.override).toEqual(CARD_LOOK);
    // It is a real library row the picker lists, not a detached view.
    const listed = await h.svc.listThemes({ principal: principal(a, "user") });
    expect(listed.map((t) => t.name)).toContain("Charlotte");
  });

  test("a VIEWER-SACRED key is stripped — a promoted theme cannot pin the promoter's shell density", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });

    const promoted = await h.svc.promoteTheme({
      principal: principal(a, "user"),
      input: { name: "Charlotte", override: { ...CARD_LOOK, density: "compact" } },
    });

    expect(promoted.override).toEqual(CARD_LOOK);
    expect("density" in promoted.override).toBe(false);
  });

  test("an unsafe value is dropped by the boundary clamp, the safe siblings survive", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });

    const promoted = await h.svc.promoteTheme({
      principal: principal(a, "user"),
      // The wire schema is lenient per-field: a hostile colour degrades to undefined rather than rejecting
      // the whole promote (the same clamp `createTheme` runs).
      input: { name: "Charlotte", override: { accent: "url(https://evil.example/x)", speaker: "red" } },
    });

    expect(promoted.override).toEqual({ speaker: "red" });
  });

  test("promoting the same character twice DE-COLLIDES the derived name instead of failing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });

    const first = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Aria", override: { accent: "red" } } });
    const second = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Aria", override: { accent: "blue" } } });
    const third = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Aria", override: { accent: "green" } } });

    expect([first.name, second.name, third.name]).toEqual(["Aria", "Aria 2", "Aria 3"]);
  });

  test("a name colliding with a SEED palette is free — seeds hold a NULL owner, so they never collide", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await ensureSeedThemes(db, () => h.clock.now());
    const a = await seedUser(db, { id: "user_a" });

    const promoted = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Hearth", override: { accent: "red" } } });

    // The unique index is `(ownerId, name)` and NULLs are distinct — an owned "Hearth" is a different row.
    expect(promoted.name).toBe("Hearth");
    expect(promoted.isSeed).toBe(false);
  });

  test("another user's identical theme name is not a collision (owner-scoped)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await h.svc.createTheme({ principal: principal(b, "user"), input: { name: "Aria", override: {} } });

    const promoted = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Aria", override: { accent: "red" } } });

    expect(promoted.name).toBe("Aria");
  });

  test("audits the promote against the minted row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });

    const promoted = await h.svc.promoteTheme({ principal: principal(a, "user"), input: { name: "Aria", override: { accent: "red" } } });

    const entry = h.audits.at(-1)?.entry;
    expect(entry?.action).toBe("theme.promote");
    expect(entry?.entityId).toBe(promoted.id);
    expect(entry?.actorUserId).toBe(a);
  });
});
