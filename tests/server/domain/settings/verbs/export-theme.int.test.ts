// verb: exportTheme — serializes the owner's OWNED themes to a portable theme-backup file. Load-bearing:
// owner-scoped (a foreign owner's themes never travel; seeds never travel), and the bytes parse back to the
// same theme set with the palette intact.

import type { PortableParse } from "@orb/contracts/portability";
import { createExportTheme, createSettingsContext } from "@orb/server/domain/settings";
import { parseThemeBackup } from "@orb/server/kit/serde/theme";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** The parse outcome's value — the portable serdes return a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

describe("exportTheme", () => {
  test("serializes only the owner's themes; the bytes parse back to the same set", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const other = await seedUser(db, { id: "user_other" });

    await h.svc.createTheme({
      principal: principal(owner, "user"),
      input: { name: "Mine A", override: { accent: "#abcdef" }, css: ".x{}" },
    });
    await h.svc.createTheme({
      principal: principal(owner, "user"),
      input: { name: "Mine B", override: {} },
    });
    await h.svc.createTheme({
      principal: principal(other, "user"),
      input: { name: "Theirs", override: {} },
    });

    const file = await createExportTheme(ctx)(owner);
    expect(file.filename).toBe("themes.json");
    const backup = must(parseThemeBackup(file.bytes));

    const names = backup?.themes.map((t) => t.name).sort();
    expect(names).toEqual(["Mine A", "Mine B"]);
    expect(backup?.themes.find((t) => t.name === "Mine A")?.override).toEqual({
      accent: "#abcdef",
    });
    expect(backup?.themes.find((t) => t.name === "Mine A")?.css).toBe(".x{}");
  });

  test("an owner with no themes exports an empty backup (seeds never travel)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_empty" });

    const backup = must(parseThemeBackup((await createExportTheme(ctx)(owner)).bytes));
    expect(backup?.themes).toEqual([]);
  });
});
