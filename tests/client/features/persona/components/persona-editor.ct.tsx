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
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { PersonaEditorMacroStory } from "../_ct-stories.tsx";

const USER_MACRO_ROW = "{{sceneTone}}";
const USER_MACRO_GLOSS = "This game's tonal register.";

const ACTIVE_PRESET_ID = "preset_ct_active";

const USER_MACROS = [{ name: "sceneTone", description: USER_MACRO_GLOSS, args: [], body: "hushed", inputs: [], strict: false }];

/** The persona editor's lorebook reads (#649) — spread FIRST into both `routeTrpc` calls. The editor mounts
 *  its world-info attachment cluster beside the description field, so every mount here fires both; neither is
 *  this file's subject (the macro plane is). Unfed they resolved `routeTrpc`'s null, which is not a view, so
 *  the book-catalog and per-persona attachment pipelines ran INERT in both tests. Empty ARRAYS are the honest
 *  default for a fresh viewer and a fresh persona — and unlike null they are real shapes the readers select
 *  over, so the attachment resolve path actually runs. */
const PERSONA_EDITOR_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // `WorldInfoBookView[]` — the viewer's whole book library, the picker's vocabulary.
  "worldInfo.listBooks": [],
  // The books already attached to THIS persona.
  "worldInfo.listForPersona": [],
  // The Connected-characters section's read (#866 S4) — empty is the honest fresh-persona default; the
  // section's own behavior is pinned below, this row just keeps every mount fed.
  "persona.listConnectedCharacters": [],
};

test("a persona description completes against the ACTIVE PRESET's user macros, gloss and all", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PERSONA_EDITOR_AMBIENT_ROUTES,
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: ACTIVE_PRESET_ID } }),
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
    ...PERSONA_EDITOR_AMBIENT_ROUTES,
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
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

// ── The Connected-characters section (#866 S4 — the junction from the persona side) ─────────────────
// The read is `persona.listConnectedCharacters`; Disconnect fires the junction's write with BOTH ids.
// The add door is the shared CharacterPicker (deliberately not RelationManagerSection's flat `available`
// array — the character library pages; see the component header), proven by the picker mounting with the
// already-connected id EXCLUDED and a pick firing `connectToCharacter`.

const CONNECTED = [{ id: "character_ct_linked", name: "Captain Vale" }];

test("Connected characters lists the junction read; Disconnect fires with both ids; the picker excludes the linked row and connects on pick", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    ...PERSONA_EDITOR_AMBIENT_ROUTES,
    "persona.listConnectedCharacters": () => CONNECTED,
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
    "persona.update": () => null,
    "persona.connectToCharacter": () => null,
    "persona.disconnectFromCharacter": () => ({ disconnected: true }),
    "character.list": () => ({
      items: [
        { id: "character_ct_linked", name: "Captain Vale", avatarHash: null, starred: false },
        { id: "character_ct_free", name: "The Cartographer", avatarHash: null, starred: false },
      ],
      nextCursor: null,
      totalCount: 2,
    }),
  });
  const component = await mount(<PersonaEditorMacroStory />);

  await expect(component.getByText("Captain Vale")).toBeVisible();

  // The add door: the picker lists ONLY unconnected characters (excludeIds carries the junction read).
  await component.getByRole("button", { name: "Connect a character" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a character" });
  await expect(dialog.getByRole("option", { name: "The Cartographer" })).toBeVisible();
  await expect(dialog.getByRole("option", { name: "Captain Vale" })).toHaveCount(0);
  await dialog.getByRole("option", { name: "The Cartographer" }).click();
  await expect
    .poll(() => trpc.lastInput("persona.connectToCharacter"), { intervals: [20, 50, 100] })
    .toMatchObject({ characterId: "character_ct_free", personaId: "persona_ct" });

  // Disconnect names the junction row, not just the persona.
  await component.getByRole("button", { name: "Disconnect" }).click();
  await expect
    .poll(() => trpc.lastInput("persona.disconnectFromCharacter"), { intervals: [20, 50, 100] })
    .toMatchObject({ characterId: "character_ct_linked", personaId: "persona_ct" });
});

test("Duplicate admits one durable intent and rejection restores retry", async ({ mount, page }) => {
  const first = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    ...PERSONA_EDITOR_AMBIENT_ROUTES,
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
    "persona.update": () => null,
    "persona.duplicate": () => (attempts++ === 0 ? first : retry),
  });
  const component = await mount(<PersonaEditorMacroStory />);
  const duplicate = component.getByRole("button", { name: "Duplicate" });

  await duplicate.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Duplicate did not resolve to a button");
    }
    button.click();
    button.click();
  });
  await first.requested;
  await expect(duplicate).toBeDisabled();
  await expect.poll(() => trpc.count("persona.duplicate")).toBe(1);

  first.release(trpcError());
  await expect(duplicate).toBeEnabled();
  await duplicate.click();
  await retry.requested;
  await expect(duplicate).toBeDisabled();
  await expect.poll(() => trpc.count("persona.duplicate")).toBe(2);
  retry.release(null);
  await expect(duplicate).toBeEnabled();
});
