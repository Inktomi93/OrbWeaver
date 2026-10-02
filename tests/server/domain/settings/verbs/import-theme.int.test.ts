// verb: importTheme — lands a theme file into the owner's OWN theme library ADDITIVELY. Load-bearing: an
// equal re-import reuses the row (created:false, no second row); a same-named DIFFERENT theme lands beside
// the original under the house numbered name with the original untouched; the write-boundary css guard
// drops unsafe CSS to null (the palette still restores); a raw SillyTavern theme converts through the same
// op; and a non-theme file returns {ok:false} without throwing.

import { createImportTheme, createSettingsContext } from "@orb/server/domain/settings";
import { buildThemeBackup } from "@orb/server/kit/serde/theme";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const ENC = new TextEncoder();

describe("importTheme", () => {
  test("restores themes into the owner's library; an equal re-import reuses them", async () => {
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

    const first = await createImportTheme(ctx)(owner, bytes);
    expect(first).toEqual({
      ok: true,
      created: true,
      landed: [
        { name: "Restored A", renamedFrom: null, created: true },
        { name: "Restored B", renamedFrom: null, created: true },
      ],
    });

    const views = await h.svc.listThemes({ principal: p });
    const owned = views.filter((v) => !v.isSeed).map((v) => v.name);
    expect(owned.sort()).toEqual(["Restored A", "Restored B"]);

    // Re-import the SAME file → equal content, zero new rows, each theme reported as reused.
    const second = await createImportTheme(ctx)(owner, bytes);
    expect(second).toEqual({
      ok: true,
      created: false,
      landed: [
        { name: "Restored A", renamedFrom: null, created: false },
        { name: "Restored B", renamedFrom: null, created: false },
      ],
    });
    const after = (await h.svc.listThemes({ principal: p })).filter((v) => !v.isSeed);
    expect(after).toHaveLength(2);
  });

  test("a same-named DIFFERENT theme lands beside the original under a numbered name; the original is untouched", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    await createImportTheme(ctx)(owner, buildThemeBackup({ themes: [{ name: "Mine", override: { accent: "#111111" }, css: null }] }));
    const outcome = await createImportTheme(ctx)(owner, buildThemeBackup({ themes: [{ name: "Mine", override: { accent: "#222222" }, css: null }] }));

    expect(outcome).toEqual({ ok: true, created: true, landed: [{ name: "Mine 2", renamedFrom: "Mine", created: true }] });
    const owned = (await h.svc.listThemes({ principal: p })).filter((v) => !v.isSeed);
    expect(owned.toSorted((a, b) => a.name.localeCompare(b.name)).map((v) => [v.name, v.override])).toEqual([
      ["Mine", { accent: "#111111" }],
      ["Mine 2", { accent: "#222222" }],
    ]);
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
    const result = await createImportTheme(ctx)(owner, bytes);
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);

    const view = (await h.svc.listThemes({ principal: principal(owner, "user") })).find((v) => v.name === "Risky");
    expect(view?.css).toBeNull(); // unsafe CSS dropped
    expect(view?.override).toEqual({ accent: "#123456" }); // palette preserved
  });

  test("a raw SillyTavern theme converts through the same op, named from the file when it carries no name", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_st" });

    const stTheme = '{"blur_tint_color":"rgba(20, 24, 30, 1)","main_text_color":"rgba(230, 230, 230, 1)","font_scale":1}';
    const result = await createImportTheme(ctx)(owner, ENC.encode(stTheme), "Night Dock");

    expect(result).toEqual({ ok: true, created: true, landed: [{ name: "Night Dock (SillyTavern)", renamedFrom: null, created: true }] });
    const view = (await h.svc.listThemes({ principal: principal(owner, "user") })).find((v) => v.name === "Night Dock (SillyTavern)");
    expect(view?.override.background).toMatch(/^oklch\(/u);
    expect(view?.override.bodyColor).toMatch(/^oklch\(/u);
  });

  test("a non-theme file returns {ok:false} with a reason, without throwing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_bad" });

    const garbage = await createImportTheme(ctx)(owner, ENC.encode("{garbage"));
    expect(garbage.ok).toBe(false);
    expect(garbage.error).toBeDefined();
    // A JSON object with no theme in it (neither an orb shape nor an ST base colour) is refused, never a blank theme.
    const blank = await createImportTheme(ctx)(owner, ENC.encode('{"name":"Nothing","chat_width":50}'));
    expect(blank.ok).toBe(false);
    expect(blank.error).toContain("no base surface colour");
    expect((await h.svc.listThemes({ principal: principal(owner, "user") })).filter((v) => !v.isSeed)).toHaveLength(0);
  });
});
