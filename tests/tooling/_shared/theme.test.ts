// The THEME arm of the probes' settings shim (tooling/src/_shared/theme.ts). Home per Spine-Testing §2: a
// test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT EXISTS (#225): `--appearance` could not reach the ACTIVE THEME (a different settings axis —
// `config.theme.selectedThemeId`), so a light-theme arm was undrivable without WRITING the owner's settings.
// These pins cover the pure half: what a request resolves to against the real library, that an unknown name
// is REFUSED loudly instead of silently rendering the account's own theme, and that the patch states the
// SELECTION only (the app fetches the real theme row itself — the shim never fabricates a palette).
import {
  applyThemeFlag,
  NO_THEME,
  parseThemeFlag,
  readThemeList,
  resolveTheme,
  THEME_VALUE_FLAGS,
  themeConfigPatch,
  themeHelpBlock,
  themeWarning,
} from "@orb/tooling/_shared/theme";
import { parseSnapArgs } from "../../../scripts/probes/snap.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

/** The live shape of `settings.listThemes` (ThemeView rows, seeds + the caller's own), batched. */
const LIBRARY = [
  { id: "theme_00000000000000000000000001", name: "Hearth", isSeed: true },
  { id: "theme_00000000000000000000000003", name: "Light", isSeed: true },
  { id: "theme_01jd0000000000000000000abc", name: "the owner's Neon", isSeed: false },
];
const LIST_BODY = [{ result: { data: LIBRARY } }];

test("the library is read out of the batched listThemes envelope; a non-list shape is null, never a guess", () => {
  expect(readThemeList(LIST_BODY)).toEqual(LIBRARY.map(({ id, name }) => ({ id, name })));
  // An auth failure / a moved schema must resolve to "I could not read the library", which WARNS.
  expect(readThemeList([{ error: { message: "UNAUTHORIZED" } }])).toBeNull();
  expect(readThemeList({ result: { data: { rows: 2 } } })).toBeNull();
});

test("a seed theme resolves by NAME, case-insensitively — the spelling an operator actually types", () => {
  const entries = readThemeList(LIST_BODY) ?? [];

  expect(resolveTheme(entries, "Light")).toEqual({ id: "theme_00000000000000000000000003" });
  expect(resolveTheme(entries, "light")).toEqual({ id: "theme_00000000000000000000000003" });
});

test("a custom theme resolves too — by name or by its minted id (no constant could know it)", () => {
  const entries = readThemeList(LIST_BODY) ?? [];

  expect(resolveTheme(entries, "alex's neon")).toEqual({ id: "theme_01jd0000000000000000000abc" });
  expect(resolveTheme(entries, "theme_01jd0000000000000000000abc")).toEqual({ id: "theme_01jd0000000000000000000abc" });
});

test("`none` is a real arm: NO selection, i.e. the shipped Hearth default a fresh account sees", () => {
  expect(resolveTheme(readThemeList(LIST_BODY) ?? [], NO_THEME)).toEqual({ id: null });
  expect(themeConfigPatch(null)).toEqual({ theme: { selectedThemeId: null } });
});

test("an unknown theme is REFUSED with the account's real list — the silent-drop trap this axis was built to avoid", () => {
  const outcome = resolveTheme(readThemeList(LIST_BODY) ?? [], "Solarized");

  expect(outcome).toMatchObject({ error: expect.stringContaining("no theme named") });
  const message = "error" in outcome ? outcome.error : "";
  for (const entry of LIBRARY) {
    expect(message).toContain(entry.name);
  }
  // …and the warning the operator sees says which arm actually rendered, not just that something failed.
  expect(themeWarning(message)).toContain("rendered the account's OWN theme");
});

test("the patch states the SELECTION only — the palette comes from the app's own getTheme read", () => {
  expect(themeConfigPatch("theme_00000000000000000000000003")).toEqual({ theme: { selectedThemeId: "theme_00000000000000000000000003" } });
});

test("an empty --theme value is CLI misuse, and a refusal routes to the CLI's error list", () => {
  expect(parseThemeFlag("  ")).toMatchObject({ error: expect.stringContaining("expects a theme name") });
  expect(parseThemeFlag(" Light ")).toEqual({ theme: "Light" });

  const args: { theme: string | null; errors: string[] } = { theme: null, errors: [] };
  applyThemeFlag(args, parseThemeFlag("Light"));
  expect(args).toEqual({ theme: "Light", errors: [] });
  applyThemeFlag(args, parseThemeFlag(""));
  expect(args.errors).toHaveLength(1);
  expect(args.theme).toBe("Light");
});

test("snap's CLI: --theme parses, the last spelling wins, and no flag = the account's own theme", () => {
  expect(parseSnapArgs(["/"]).theme).toBeNull();
  expect(parseSnapArgs(["/", "--theme", "Light"]).theme).toBe("Light");
  expect(parseSnapArgs(["/", "--theme", "Light", "--theme", "Mocha"]).theme).toBe("Mocha");
  // Value-consuming: a missing value must not silently swallow the following flag.
  expect(THEME_VALUE_FLAGS).toContain("--theme");
  expect(parseSnapArgs(["/", "--theme", "--json"]).errors[0]).toContain("--theme");
  // A static mock makes no settings request, so the shim would be a lie there.
  expect(parseSnapArgs(["--file", "x.html", "--theme", "Light"]).theme).toBe("Light");
});

test("the shared help block names the seeds, the none arm, and the carried-room takeover", () => {
  const help = themeHelpBlock();

  expect(help).toContain("--theme <name|id>");
  expect(help).toContain("Light");
  expect(help).toContain("none");
  expect(help).toContain("carries a theme");
});
