// verb: importThemeFile — the single-theme door over the SAME op the bundle restore calls. Pins the three
// grammars one picked file can arrive in — the Looks section's own `{name, override, css}` export (the
// round trip), an `orb.theme` backup, a raw SillyTavern theme (named from the picked file) — and that a
// non-theme file is a refusal as words, never a blank theme.

import { createSettingsService } from "@orb/server/domain/settings";
import { buildThemeBackup } from "@orb/server/kit/serde/theme";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const DEC = new TextDecoder();

describe("importThemeFile", () => {
  test("the Looks section's own export round-trips through the door; a re-import reuses it", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createSettingsService(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    const fileText = JSON.stringify({ name: "Weft", override: { accent: "#abcdef" }, css: null });
    const first = await svc.importThemeFile({ principal: p, fileText, filename: "Weft.orbtheme.json" });
    expect(first).toEqual({ ok: true, created: true, name: "Weft", renamedFrom: null });
    const second = await svc.importThemeFile({ principal: p, fileText, filename: "Weft.orbtheme.json" });
    expect(second).toEqual({ ok: true, created: false, name: "Weft", renamedFrom: null });

    const owned = (await svc.listThemes({ principal: p })).filter((v) => !v.isSeed);
    expect(owned.map((v) => v.name)).toEqual(["Weft"]);
    expect(owned[0]?.override).toEqual({ accent: "#abcdef" });
  });

  test("an orb.theme backup lands through the door too", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createSettingsService(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    const fileText = DEC.decode(buildThemeBackup({ themes: [{ name: "Backed", override: {}, css: null }] }));
    expect(await svc.importThemeFile({ principal: p, fileText })).toEqual({ ok: true, created: true, name: "Backed", renamedFrom: null });
  });

  test("a raw SillyTavern theme converts, named from the picked file when it carries no name", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createSettingsService(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    const fileText = '{"blur_tint_color":"rgba(20, 24, 30, 1)","main_text_color":"rgba(230, 230, 230, 1)"}';
    const outcome = await svc.importThemeFile({ principal: p, fileText, filename: "Night Dock.json" });
    expect(outcome).toEqual({ ok: true, created: true, name: "Night Dock (SillyTavern)", renamedFrom: null });
  });

  test("a non-theme JSON is refused with the reason; nothing is created", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createSettingsService(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    const outcome = await svc.importThemeFile({ principal: p, fileText: '{"name":"Nothing","chat_width":50}', filename: "Nothing.json" });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error).toContain("no base surface colour");
    expect((await svc.listThemes({ principal: p })).filter((v) => !v.isSeed)).toHaveLength(0);
  });
});
