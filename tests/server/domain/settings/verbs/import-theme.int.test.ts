// verb: importTheme — restores a theme-backup file into the owner's OWN theme library. Load-bearing: idempotent
// (dedup by (ownerId, name) — a re-import creates zero), the write-boundary css guard drops unsafe CSS to null
// (the palette still restores), and a non-theme file returns {ok:false} without throwing.

import { createSettingsContext, createThemeImport } from "@orb/server/domain/settings";
import { buildThemeBackup } from "@orb/server/kit/serde/theme";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("importTheme", () => {
  test("restores themes into the owner's library; idempotent on re-import", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    const bytes = buildThemeBackup({
      themes: [
        { name: "Restored A", override: { accent: "#abcdef" }, css: null },
        { name: "Restored B", override: {}, css: null },
      ],
    });

    const first = await createThemeImport(ctx)(owner, bytes);
    expect(first).toEqual({ ok: true, created: true });

    const views = await h.svc.listThemes({ principal: p });
    const owned = views.filter((v) => !v.isSeed).map((v) => v.name);
    expect(owned.sort()).toEqual(["Restored A", "Restored B"]);

    // Re-import the SAME file → dedup by (owner, name), zero new rows.
    const second = await createThemeImport(ctx)(owner, bytes);
    expect(second).toEqual({ ok: true, created: false });
    const after = (await h.svc.listThemes({ principal: p })).filter((v) => !v.isSeed);
    expect(after).toHaveLength(2);
  });

  test("unsafe custom CSS degrades to null; the palette still restores", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_css" });

    // `position: fixed` is a containment break the css validator rejects (the createTheme precedent).
    const bytes = buildThemeBackup({
      themes: [{ name: "Risky", override: { accent: "#123456" }, css: ".x { position: fixed; }" }],
    });
    const result = await createThemeImport(ctx)(owner, bytes);
    expect(result).toEqual({ ok: true, created: true });

    const view = (await h.svc.listThemes({ principal: principal(owner, "user") })).find(
      (v) => v.name === "Risky",
    );
    expect(view?.css).toBeNull(); // unsafe CSS dropped
    expect(view?.override).toEqual({ accent: "#123456" }); // palette preserved
  });

  test("a non-theme file returns {ok:false} without throwing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_bad" });

    const result = await createThemeImport(ctx)(owner, new TextEncoder().encode("{garbage"));
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
