// CT: `<PersonaList>` — the persona MANAGEMENT surface at its one remaining mount posture (#866 S4
// moved it out of the rail popover and the You sheet into Config → Personas; the switcher CT is
// `persona-panel-surface.ct.tsx`). Two pin families live here:
//
// 1) THE #443/#458/#463 COLLISION PINS (ported from the old You-sheet surface CT — the rows are the same
//    `PersonaPanelRow`s, the mount moved). Two personas can legitimately carry the same name, and the
//    row's name-embedding controls then announce IDENTICAL accessible names; the qualifier is resolved
//    with the WHOLE list in hand, and it is SPENT (collision-only), never sprayed.
//
// 2) THE S4 LIST RESTRUCTURE: pin-not-crown (exactly ONE named pin marker however many rows CLAIM
//    default in user prose), the ⋯ = Edit · Duplicate · Export · Delete inventory, and the band's third
//    door (From character → `persona.createFromCharacter`, the picker IS the create).

import { renameActionName, rowActionsName } from "@orb/client/lib";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PersonaListStory } from "../_ct-stories.tsx";

const NOVA = "persona_nova";
const TRAVELER_OLD = "persona_traveler_old";
const TRAVELER_NEW = "persona_traveler_new";

// The prose that CLAIMS default. It was the SEEDER's title until #462 (owner ruling 2026-08-22) replaced
// the seeded copy with a descriptor — precisely because a state sentence in user-editable prose goes false
// and stays displayed. A user can still type this sentence into any persona's title; the fence below is
// about what the client DERIVES when N rows claim default in prose.
const DEFAULT_CLAIMING_TITLE = "Your default persona";

const ACTIONS_LABEL = /^Actions for /;
const SWITCH_LABEL = /^Switch to /;
const QUALIFIED_TRAVELER = /^Actions for "Traveler" · .+/;

// THREE rows, two of them same-named — the shape the collision actually needs (see the old surface CT's
// rationale, carried whole): with a third row holding "current", both Travelers are switch-targets and the
// collision is reachable on both controls. Both Travelers carry the default-CLAIMING title.
const PERSONAS = [
  {
    id: NOVA,
    name: "Nova",
    title: "the navigator",
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: TRAVELER_OLD,
    name: "Traveler",
    title: DEFAULT_CLAIMING_TITLE,
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1_787_334_249_923,
    updatedAt: 1_787_334_249_923,
  },
  {
    id: TRAVELER_NEW,
    name: "Traveler",
    title: DEFAULT_CLAIMING_TITLE,
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1_787_404_033_943,
    updatedAt: 1_787_404_033_943,
  },
];

/** Nova is BOTH the current and the default persona, so neither Traveler is current and neither is pinned.
 *  The three editor reads are fed with honest fresh-viewer empties — the Edit arm below EXPANDS a row's
 *  editor, which mounts the lorebook cluster and the Connected-characters section. */
function stub(page: Page, extra: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: NOVA } },
      updatedAt: 0,
    }),
    "worldInfo.listBooks": () => [],
    "worldInfo.listForPersona": () => [],
    "persona.listConnectedCharacters": () => [],
    ...extra,
  });
}

/** The accessible names of every control matching `pattern`, in DOM order — read off `aria-label` because
 *  that IS the computed name for these icon-only / stretched controls. */
async function labels(page: Page, pattern: RegExp): Promise<readonly string[]> {
  const all = await page
    .locator("button[aria-label]")
    .evaluateAll((els: readonly Element[]): readonly string[] => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return all.filter((label) => pattern.test(label));
}

/** Every `aria-label`-named control INSIDE a persona row, grouped by row, in DOM order — scoped to the
 *  rows so the band's own verbs (New / Restore / From character) are not mistaken for row controls. */
function rowControlLabels(page: Page): Promise<readonly (readonly string[])[]> {
  return page
    .locator('[data-slot="persona-row-name"]')
    .evaluateAll((els: readonly Element[]): readonly (readonly string[])[] =>
      els.map((el) =>
        Array.from((el.parentElement as HTMLElement).querySelectorAll("button[aria-label]")).map((button) => button.getAttribute("aria-label") ?? ""),
      ),
    );
}

// ── The #443/#458/#463 collision pins (ported — the mount moved, the grammar did not) ───────────────

test("no two controls in the persona list share an accessible name — every row control names its row", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const rows = await rowControlLabels(page);
  expect(rows).toHaveLength(3);
  const all = rows.flat();
  // The receipt names the offenders rather than a bare count.
  expect(all.filter((label, index) => all.indexOf(label) !== index)).toEqual([]);
});

test("each row's controls all embed that row's persona name", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const [nova, ...travelers] = await rowControlLabels(page);
  expect(nova?.length ?? 0).toBeGreaterThan(3);
  expect((nova ?? []).filter((label) => !label.includes("Nova"))).toEqual([]);
  for (const row of travelers) {
    expect(row.filter((label) => !label.includes("Traveler"))).toEqual([]);
  }
});

test("two same-named personas get DISTINCT kebab names — the row's actions announce which row they belong to", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const actions = await labels(page, ACTIONS_LABEL);
  expect(actions).toHaveLength(3);
  expect(new Set(actions).size).toBe(3);
  // …and the escalation wears the HOUSE grammar (`rowActionSubject`: `"name" · qualifier`).
  expect(actions.filter((label) => QUALIFIED_TRAVELER.test(label))).toHaveLength(2);
});

test("two same-named personas get DISTINCT switch-target names — the stretched select button too", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const switches = await labels(page, SWITCH_LABEL);
  expect(switches).toHaveLength(2); // Nova is current, so its row carries the current arm instead
  expect(new Set(switches).size).toBe(2);
});

test("a row whose name does NOT collide keeps its bare name — no qualifier is spent", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);

  await expect(page.getByRole("button", { name: rowActionsName("Nova"), exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova — current persona", exact: true })).toBeVisible();
});

// ── Pin-not-crown at the LIST level (#866 S4; the crown fence's successor) ──────────────────────────
// N rows may CLAIM default in user-editable prose; only the row `seeds.defaultPersonaId` names wears the
// SOLID pin marker, and every other row offers the faint click-to-pin VERB instead. The crown is gone
// from the whole tree — the glyph class is the negative control.

test("exactly ONE row wears the solid pin, however many rows CLAIM default in their subtitle prose — and no crown exists", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  await expect(page.getByText(DEFAULT_CLAIMING_TITLE)).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Pinned — your default persona" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Pin .* as your default$/ })).toHaveCount(2);
  await expect(page.locator("svg.lucide-crown")).toHaveCount(0);
});

test("clicking a faint pin writes seeds.defaultPersonaId for THAT row's persona", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.updateUserSettingsSection": () => ({}) });
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const pins = await labels(page, /^Pin "Traveler" · .+ as your default$/);
  expect(pins).toHaveLength(2); // the qualifier reaches the pin too — it embeds the row SUBJECT
  await page.getByRole("button", { name: pins[0] ?? "", exact: true }).dispatchEvent("click");
  await expect
    .poll(() => trpc.lastInput("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] })
    .toMatchObject({ section: "seeds", patch: { defaultPersonaId: TRAVELER_OLD } });
});

// ── The ⋯ inventory (#866 S4): Edit · Duplicate · Export · Delete ───────────────────────────────────

test("the row ⋯ carries Edit · Duplicate · Export · Delete; Edit expands the editor; Duplicate fires the verb", async ({ mount, page }) => {
  const trpc = await stub(page, { "persona.duplicate": () => PERSONAS[0] });
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  // The fine-pointer kebab is hover-revealed; hovering the row's rename control is the real user path.
  await page.getByRole("button", { name: renameActionName("Nova"), exact: true }).hover();
  await page.getByRole("button", { name: rowActionsName("Nova"), exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  for (const item of ["Edit", "Duplicate", "Export", "Delete"]) {
    await expect(menu.getByRole("menuitem", { name: item, exact: true })).toBeVisible();
  }
  // Set-as-default LEFT the menu — the pin owns the verb at every pointer class now.
  await expect(menu.getByRole("menuitem", { name: "Set as default" })).toHaveCount(0);

  await menu.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect.poll(() => trpc.count("persona.duplicate"), { intervals: [20, 50, 100] }).toBe(1);

  await page.getByRole("button", { name: renameActionName("Nova"), exact: true }).hover();
  await page.getByRole("button", { name: rowActionsName("Nova"), exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Edit", exact: true }).click();
  // Edit IS the expansion (the editing model's home is unchanged) — the row's disclosure flips open.
  await expect(page.getByRole("button", { name: "Hide details for Nova", exact: true })).toBeVisible();
});

// ── The band's third door: From character (#866 S4) ─────────────────────────────────────────────────

const CHAR_ID = "character_ct_source";

test("the From-character door opens the picker dialog; picking a character mints via createFromCharacter with the swap flag", async ({ mount, page }) => {
  const trpc = await stub(page, {
    "character.list": () => ({
      items: [{ id: CHAR_ID, name: "Captain Vale", avatarHash: null, starred: false }],
      nextCursor: null,
      totalCount: 1,
    }),
    "persona.createFromCharacter": () => ({ ...PERSONAS[0], id: "persona_minted", name: "Captain Vale" }),
  });
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New persona from a character", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New persona from a character" });
  await expect(dialog).toBeVisible();
  // The swap switch defaults ON (a card's {{char}} prose must speak as {{user}} in a persona POV).
  const swap = dialog.getByRole("switch");
  await expect(swap).toBeChecked();

  await dialog.getByRole("option", { name: "Captain Vale" }).click();
  await expect
    .poll(() => trpc.lastInput("persona.createFromCharacter"), { intervals: [20, 50, 100] })
    .toMatchObject({ characterId: CHAR_ID, swapMacros: true });
});

test("flipping the swap switch OFF is honored on the wire", async ({ mount, page }) => {
  const trpc = await stub(page, {
    "character.list": () => ({
      items: [{ id: CHAR_ID, name: "Captain Vale", avatarHash: null, starred: false }],
      nextCursor: null,
      totalCount: 1,
    }),
    "persona.createFromCharacter": () => ({ ...PERSONAS[0], id: "persona_minted", name: "Captain Vale" }),
  });
  await mount(<PersonaListStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New persona from a character", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New persona from a character" });
  await dialog.getByRole("switch").click();
  await dialog.getByRole("option", { name: "Captain Vale" }).click();
  await expect
    .poll(() => trpc.lastInput("persona.createFromCharacter"), { intervals: [20, 50, 100] })
    .toMatchObject({ characterId: CHAR_ID, swapMacros: false });
});
