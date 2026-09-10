// CT: `usePromptMacroSuggestions` — the ONE home of the GLOBAL-editor macro plane (MACU-2, owner ruling
// 2026-08-03: the macro plane goes everywhere macros WORK). A persona description and a character card facet
// are rendered at turn assembly through the PER-TURN registry `buildTurnUserMacros` composes, so the active
// preset's user macros genuinely resolve in them — this hook is what puts them in the popover.
//
// Its three load-bearing behaviours are all about the SOURCING, not the curation (which `withUserMacros` owns
// and `tests/client/lib/prompt-macros.test.ts` pins):
//   1. THE UNION — the active preset's macros arrive beside the builtins, and LEAD them.
//   2. THE BUILT-IN ARM — `defaultPresetId: null` IS the built-in preset, which declares no user macros: no
//      preset read fires at all, and the field is still completable against the builtins.
//   3. NO EMPTY WINDOW — while the reads are in flight the catalog is the builtin one, never `[]`; a popover
//      that opened empty on the first keystroke would read as "this field has no macros".

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../support/node/route-trpc.ts";
import { userSettingsView } from "../../support/node/user-settings-view.ts";
import { PromptMacroSuggestionsStory } from "./_ct-stories.tsx";

const ACTIVE_PRESET_ID = "preset_ct_active";
const USER_MACROS = [{ name: "sceneTone", description: "This game's tonal register.", args: [], body: "hushed", inputs: [], strict: false }];

test("the ACTIVE preset's user macros join the builtin catalog — and LEAD it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: ACTIVE_PRESET_ID } }),
    "preset.get": () => ({ config: { userMacros: USER_MACROS } }),
  });
  const component = await mount(<PromptMacroSuggestionsStory />);

  await expect(component.getByTestId("macro-lead")).toHaveText("sceneTone");
  // The builtins are still all there — the union ADDS a plane, it never replaces the catalog.
  await expect(component.getByTestId("macro-names")).toContainText("char");
  await expect(component.getByTestId("macro-names")).toContainText("persona");
});

test("`defaultPresetId: null` is the BUILT-IN preset — no preset read fires, the builtins still complete", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
    "preset.get": () => ({ config: { userMacros: USER_MACROS } }),
  });
  const component = await mount(<PromptMacroSuggestionsStory />);

  await expect(component.getByTestId("macro-names")).toContainText("char");
  await expect(component.getByTestId("macro-names")).not.toContainText("sceneTone");
  await expect.poll(() => trpc.count("preset.get")).toBe(0);
});

test("a WITHHELD settings read still yields the builtin catalog — never an empty popover", async ({ mount, page }) => {
  const settings = trpcHold();
  await routeTrpc(page, { "settings.getUserSettings": settings });
  try {
    const component = await mount(<PromptMacroSuggestionsStory />);
    await settings.requested;

    await expect(component.getByTestId("macro-names")).toContainText("char");
  } finally {
    // Release even when the assertion fails, so the held HTTP batch cannot outlive the test.
    settings.release(userSettingsView());
  }
});
