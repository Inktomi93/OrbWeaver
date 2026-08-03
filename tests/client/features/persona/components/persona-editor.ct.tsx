// CT: MACU-2 — the USER-MACRO PLANE reaches the persona description's `{{ }}` completion (owner ruling
// 2026-08-03, "the macro plane goes everywhere macros WORK").
//
// It qualifies on MECHANISM, not on vibe: a persona description is rendered during turn assembly through
// `renderMacros` with the PER-TURN registry `buildTurnUserMacros` composes (builtins + the active preset's
// `userMacros` + the game's), so a macro the author declared on their preset genuinely resolves in this
// field. Before this the editor offered a hand-curated list of THREE builtins, so the vocabulary the turn
// would honour was invisible on the surface that authors against it.
//
// The assertion is the popover ROW — the user's affordance — never the catalog object, and the fixture macro
// is named so no builtin is a fuzzy match for its prefix (a row proving the plane landed must not be
// satisfiable by the builtin catalog alone).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PersonaEditorMacroStory } from "../_ct-stories.tsx";

const USER_MACRO_ROW = "{{sceneTone}}";
const USER_MACRO_GLOSS = "This game's tonal register.";

const ACTIVE_PRESET_ID = "preset_ct_active";

const USER_MACROS = [{ name: "sceneTone", description: USER_MACRO_GLOSS, args: [], body: "hushed", inputs: [], strict: false }];

test("a persona description completes against the ACTIVE PRESET's user macros, gloss and all", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({ config: { seeds: { defaultPresetId: ACTIVE_PRESET_ID } } }),
    "preset.get": () => ({ config: { userMacros: USER_MACROS } }),
    "persona.update": () => null,
  });
  const component = await mount(<PersonaEditorMacroStory />);

  const description = component.getByRole("textbox", { name: "Description" });
  await expect(description).toBeVisible();
  await description.click();
  await description.pressSequentially("{{scen");

  // The row is present AND carries the DEFINITION's own gloss — proving it came from the plane, not a name.
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toBeVisible();
  await expect(page.getByText(USER_MACRO_GLOSS)).toBeVisible();
});

test("with the BUILT-IN preset active there is no plane to read — the builtin catalog still completes", async ({ mount, page }) => {
  // `defaultPresetId: null` IS the built-in pick, which declares no user macros: the hook must not fetch a
  // preset at all, and the field must still be completable (never an empty popover waiting on a read).
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => ({ config: { seeds: { defaultPresetId: null } } }),
    "preset.get": () => ({ config: { userMacros: USER_MACROS } }),
    "persona.update": () => null,
  });
  const component = await mount(<PersonaEditorMacroStory />);

  const description = component.getByRole("textbox", { name: "Description" });
  await description.click();
  await description.pressSequentially("{{pers");

  await expect(page.getByRole("option", { name: "{{persona}}" })).toBeVisible();
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toHaveCount(0);
  await expect.poll(() => trpc.count("preset.get")).toBe(0);
});
