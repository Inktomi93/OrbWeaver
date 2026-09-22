// CT: the two clusters `character-appearance-tab.tsx` owns, each now its own CONTEXT tab (#841/#860) — the
// §8.1 per-character THEME cluster in **Look**, and the render-posture controls in **Trust**. Its own
// mounts say which: `CharacterLookTabStory` above the Trust divider, `CharacterTrustTabStory` below it.
//
// The §8.1 per-character THEME cluster in the CONTEXT Look tab (FINAL-Character §8). Drives the
// PRODUCTION path — `character.get` seeds the current override, `character.update` is stubbed + recorded
// (routeTrpc). Asserts the three commit semantics that keep this lane from being built wrong (§2):
//   • IMMEDIATE-commit: an enum pick fires `character.update({ themeOverride })` at once (no save-bar).
//   • Per-field CLEAR: picking Inherit on one control OMITS that field from the blob (the rest survive).
//   • Reset to global: sends `themeOverride: null` (drop the whole override → inherit the global theme).
//   • A debounced COLOUR edit still lands as one write carrying the picked colour.
// The write is the WHOLE merged blob (raw + unmerged — resolution is a `<ThemeScope>` nesting concern).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CharacterLookTabPanelStory, CharacterLookTabStory, CharacterTrustTabStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

/** The colour-science notation this panel must never print as a user-facing value (#841). */
const OKLCH_RE = /oklch\(/u;

/** The `themeOverride` blob carried by the most recent `character.update` (or undefined if none). */
function lastThemeOverride(trpc: TrpcRecorder): unknown {
  const input = trpc.lastInput("character.update") as { input?: { themeOverride?: unknown } } | undefined;
  return input?.input?.themeOverride;
}

/** The theme picker's catalog read. Hoisted above `route()` (#649) because EVERY mount of this tab renders
 *  the "Start from a theme…" door, so every routeTrpc site owes it: `listThemes` is "the caller's own themes
 *  PLUS every seed palette" (domain/settings/verbs/list-themes.ts:1), so an empty array is a shape the server
 *  cannot mint and `routeTrpc`'s unfed null is not a view at all — the picker's resolve path never ran. */
const THEME_LIST: TrpcWireOutput<"settings.listThemes"> = [
  {
    id: "theme_00000000000000000000000002",
    name: "Mocha",
    override: { background: "oklch(0.15 0.015 250)", accent: "oklch(0.7 0.14 250)", density: "compact" },
    css: null,
    isSeed: true,
    isDefault: false,
    createdAt: 0,
    updatedAt: 0,
  },
];

function route(page: Page, themeOverride: Record<string, unknown> | null): Promise<TrpcRecorder> {
  const card = makeCharacterDetail({ themeOverride });
  return routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
}

test("§8.1 an enum pick is an IMMEDIATE commit — one field, the whole blob, no save-bar", async ({ mount, page }) => {
  const trpc = await route(page, null);
  await mount(<CharacterLookTabStory />);

  await page.getByRole("combobox", { name: "Corner radius" }).click();
  await page.getByRole("option", { name: "Card", exact: true }).click();

  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ radius: "card" });
  // Immediate-commit surfaces never light a draft dirty pill (§2).
  await expect(page.getByText("Unsaved")).toHaveCount(0);
});

test("§8.1 per-field clear — picking Inherit OMITS that field, the others survive", async ({ mount, page }) => {
  const trpc = await route(page, { radius: "card", font: "Georgia" });
  await mount(<CharacterLookTabStory />);

  await page.getByRole("combobox", { name: "Font" }).click();
  await page.getByRole("option", { name: "Inherit", exact: true }).click();

  // font dropped from the blob → it inherits the parent scope; radius is untouched.
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ radius: "card" });
});

// SEEN, NOT READ (#866 §7.8): a typeface is seen, so each font OPTION renders IN its own face — the
// style DERIVES from the option's value (`labelStyle: { fontFamily: value }`), never a second table.
// Computed-style read, WHOLE value (the sliced-string lesson): the family list must LEAD with the value.
test("font options render in their own typeface — derived from the value", async ({ mount, page }) => {
  await route(page, {});
  await mount(<CharacterLookTabStory />);

  await page.getByRole("combobox", { name: "Font" }).click();
  const georgia = page.getByRole("option", { name: "Georgia", exact: true });
  await expect(georgia).toBeVisible();
  await expect
    .poll(() =>
      georgia
        .locator('[data-slot="select-item-body"] > *')
        .first()
        .evaluate((el: HTMLElement) => getComputedStyle(el).fontFamily),
    )
    .toContain("Georgia");
  // Inherit carries NO face of its own — it is not a typeface, and styling it would be a lie.
  const inherit = page.getByRole("option", { name: "Inherit", exact: true });
  const bodyFace = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  await expect
    .poll(() =>
      inherit
        .locator('[data-slot="select-item-body"] > *')
        .first()
        .evaluate((el: HTMLElement) => getComputedStyle(el).fontFamily),
    )
    .toBe(bodyFace);
});

test("§8.1 Reset to global sends themeOverride: null", async ({ mount, page }) => {
  const trpc = await route(page, { radius: "card" });
  await mount(<CharacterLookTabStory />);

  await page.getByRole("button", { name: "Reset all to Inherit" }).click();
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toBeNull();
});

test("§8.1 Reset is disabled when there is no override to clear", async ({ mount, page }) => {
  await route(page, null);
  await mount(<CharacterLookTabStory />);
  await expect(page.getByRole("button", { name: "Reset all to Inherit" })).toBeDisabled();
});

test("§8.1 a colour edit debounces into one write carrying the picked colour", async ({ mount, page }) => {
  const trpc = await route(page, null);
  await mount(<CharacterLookTabStory />);

  await page.getByLabel("Accent").click();
  await page.getByLabel("Hex").fill("#00ff00");

  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ accent: "#00ff00" });
});

// ── The card-embeddable partition: a card carries IDENTITY, never the viewer's ERGONOMICS (TD §3) ─────
// `chatStyle` and `density` are VIEWER-SACRED: the row skin reads `appearance.chatStyle` only, and no
// card path stamps `data-density` (`CARD_EMBEDDABLE_THEME_KEYS` excludes it — since the #866 §7.8 hoist
// the density rule is a bare-attribute selector any box COULD re-scope, so the partition is the one
// enforcement, not the selector's shell scoping). A card control for either governed NOTHING — the D107
// dead-switch class. The controls are struck; the partition is what keeps them from coming back.

test("the card cannot force viewer ergonomics — no Message style / Density control (D107)", async ({ mount, page }) => {
  await route(page, { radius: "card" });
  await mount(<CharacterLookTabStory />);
  // The sibling Type & shape controls still render — proof the cluster mounted and the absence is real.
  await expect(page.getByRole("combobox", { name: "Corner radius" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message style" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Density" })).toHaveCount(0);
});

// ── The two theme DOORS (TD §2) — promote the card's look into the picker, and seed it from a theme ───

test("Save as theme… promotes the LIVE override, defaulted to the character's name", async ({ mount, page }) => {
  const card = makeCharacterDetail({ themeOverride: { accent: "#00ff00" } });
  const trpc = await routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
    "settings.promoteTheme": () => ({
      id: "theme_new",
      name: "Aria",
      override: { accent: "#00ff00" },
      css: null,
      isSeed: false,
      isDefault: false,
      createdAt: 0,
      updatedAt: 0,
    }),
  });
  await mount(<CharacterLookTabStory />);

  await page.getByRole("button", { name: "Save as theme…" }).click();
  await expect.poll(() => trpc.lastInput("settings.promoteTheme"), { intervals: [20, 50, 100] }).toEqual({ name: "Aria", override: { accent: "#00ff00" } });
});

test("Save as theme… is disabled while the card has nothing of its own to promote", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: null }),
    "character.update": () => makeCharacterDetail({ themeOverride: null }),
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  await mount(<CharacterLookTabStory />);
  await expect(page.getByRole("button", { name: "Save as theme…" })).toBeDisabled();
});

test("Start from a theme… seeds the card from the theme's CARD-EMBEDDABLE subset (density never rides)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: null }),
    "character.update": () => makeCharacterDetail({ themeOverride: null }),
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  await mount(<CharacterLookTabStory />);

  // The Looks-grammar menu (#866 S4): swatch-stripe rows in a Menu, never a name-only Select.
  await page.getByRole("button", { name: "Start from a theme…" }).click();
  await page.getByRole("menuitem", { name: "Mocha", exact: true }).click();

  // The theme's colours land as ordinary card values (no linkage); its `density` — viewer-sacred — does not.
  await expect
    .poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] })
    .toEqual({ background: "oklch(0.15 0.015 250)", accent: "oklch(0.7 0.14 250)" });
});

// ── Trust: the external-media control must not LIE (owner ruling 2026-08-01) ──────────────────────────
// The deployment "Block external media" setting is the ABSOLUTE ceiling: the server-side render-policy
// resolver is tighten-only and the document CSP is built from the deployment value alone, so while it is
// on, EVERY value of this per-character control resolves to blocked. It therefore renders DISABLED with the
// reason said out loud, never as a live-looking "Allow" (D107 — no dead switches). The deployment verdict
// rides `/api/auth/config.forbidExternalMedia`, stubbed here at the network boundary — the honest source.

/** Stub `/api/auth/config` — the honest source for BOTH deployment ceilings this tab reads. The interactive
 *  one (#111 leg 3) defaults to the SHIPPED floor (off) so a test that does not mention it gets the
 *  deployment a fresh box actually has. */
async function stubDeployment(page: Page, opts: { readonly externalMediaBlocked: boolean; readonly interactiveCards?: boolean }): Promise<void> {
  // `httpRoute`, not `route` — the module already has a `route()` trpc helper (noShadow).
  await page.route("**/api/auth/config", (httpRoute) =>
    httpRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "single-user",
        requiresLogin: false,
        localEnabled: false,
        oidcEnabled: false,
        discreetLogin: false,
        defaultHandle: null,
        multiHumanCapable: false,
        forbidExternalMedia: opts.externalMediaBlocked,
        allowInteractiveCards: opts.interactiveCards === true,
      }),
    }),
  );
}

const stubExternalMediaBlocked = async (page: Page, blocked: boolean): Promise<void> =>
  await stubDeployment(page, { externalMediaBlocked: blocked, interactiveCards: true });

const LOCK_COPY_RE = /External media is blocked deployment-wide/u;

test("deployment BLOCKS external media → the per-character control is disabled + explained (no dead switch)", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, true);
  await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await expect(page.getByRole("combobox", { name: "External media" })).toBeDisabled();
  await expect(page.getByText(LOCK_COPY_RE)).toBeVisible();
  // The sibling Trust control is a DIFFERENT axis (trustHtml escalation stays per-character) — untouched.
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});

test("deployment ALLOWS external media → the control is live and the lock copy is absent", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await expect(page.getByRole("combobox", { name: "External media" })).toBeEnabled();
  await expect(page.getByText(LOCK_COPY_RE)).toHaveCount(0);
});

// ── HTML rendering is ONE LADDER, not two switches (owner ruling 2026-08-16, #111) ────────────────────
// Untrusted < Render HTML < Interactive, plus Inherit. The pin that matters is the WRITE: picking the top
// rung must persist the render trust it implies, because "interactive but untrusted" is a state no
// consumer should ever have to interpret. The rungs are asserted in ORDER — the control IS the ladder.

const INTERACTIVE_VALUE_RE = /Interactive/u;
/** The note shown ONLY while the deployment ceiling is down (#111 leg 3). It replaces leg 1's "card scripts
 *  stay switched off until the security review lands" copy, which became false when the grant landed — an
 *  assertion update the grant REQUIRED, since the whole point is that the rung now does something. */
const CEILING_DOWN_COPY_RE = /Interactive is switched off deployment-wide/u;
/** The ladder gloss, always shown. Pinned on the clause that describes the CAPABILITY, so a future edit that
 *  quietly re-softens it back to "scripts are off" reds here. */
const LADDER_COPY_RE = /Interactive is Render HTML plus cards that run their own scripts/u;

/** The `character.update` input carried by the most recent write. */
function lastUpdateInput(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput("character.update") as { input?: Record<string, unknown> } | undefined)?.input;
}

test("the HTML rendering control offers the ladder IN ORDER, with Inherit as the no-override option (#111)", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await expect(page.getByRole("option")).toHaveText(["Inherit default", "Untrusted", "Render HTML", "Interactive"]);
});

test("picking Interactive WRITES the render trust it implies — the incoherent pair is unwritable (#111)", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  const trpc = await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await page.getByRole("option", { name: "Interactive", exact: true }).click();

  await expect.poll(() => lastUpdateInput(trpc), { intervals: [20, 50, 100] }).toEqual({ trustHtml: true, interactiveHtml: true });
});

test("the lower rungs write the pair too — Render HTML is trusted-but-static, Untrusted is the floor", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  const trpc = await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await page.getByRole("option", { name: "Render HTML", exact: true }).click();
  await expect.poll(() => lastUpdateInput(trpc), { intervals: [20, 50, 100] }).toEqual({ trustHtml: true, interactiveHtml: false });

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await page.getByRole("option", { name: "Untrusted", exact: true }).click();
  await expect.poll(() => lastUpdateInput(trpc), { intervals: [20, 50, 100] }).toEqual({ trustHtml: false, interactiveHtml: false });
});

test("Inherit clears BOTH columns — a cleared render step must not leave an interactive opt-in behind", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  const card = makeCharacterDetail({ trustHtml: true, interactiveHtml: true });
  const trpc = await routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "settings.listThemes": () => THEME_LIST,
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  await mount(<CharacterTrustTabStory />);

  // It reads back at the top rung first — the stored value is shown, never invented.
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toHaveText(INTERACTIVE_VALUE_RE);
  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await page.getByRole("option", { name: "Inherit default", exact: true }).click();
  await expect.poll(() => lastUpdateInput(trpc), { intervals: [20, 50, 100] }).toEqual({ trustHtml: null, interactiveHtml: null });
});

// ── The top rung reads honestly against the DEPLOYMENT CEILING (#111 leg 3) ───────────────────────────
// Leg 1's copy promised "card scripts stay switched off until the security review lands". That review
// landed and granted them, so the copy had to change — and what replaces it is the harder thing to keep
// honest: the rung is live on some deployments and inert on others, and the tab has to say WHICH.
//
// The control stays ENABLED either way, unlike the external-media row above. That asymmetry is deliberate:
// there the ceiling makes every value inert, here it makes one of four inert, and disabling the whole
// select would take away three working choices to explain the fourth.

test("ceiling UP → the ladder promises scripts and shows no deployment note", async ({ mount, page }) => {
  await stubDeployment(page, { externalMediaBlocked: false, interactiveCards: true });
  await route(page, null);
  await mount(<CharacterTrustTabStory />);

  await expect(page.getByText(LADDER_COPY_RE)).toBeVisible();
  await expect(page.getByText(CEILING_DOWN_COPY_RE)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});

test("ceiling DOWN (the shipped floor) → the tab says the rung is inert, and still lets you pick it", async ({ mount, page }) => {
  await stubDeployment(page, { externalMediaBlocked: false });
  await route(page, null);
  await mount(<CharacterTrustTabStory />);

  // The honest note names the remedy and where it lives — the D107 no-dead-switch posture, said in copy
  // rather than by disabling, because the other three rungs still work.
  await expect(page.getByText(CEILING_DOWN_COPY_RE)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
  // …and the rung is still WRITABLE: a host may opt a card in ahead of the admin flip, which is exactly
  // what the stored-consent model expects (the mint re-checks the ceiling on every card it builds).
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTEXT-PANEL DENSITY CONTRACT + the #841 delta, folded in from the retired options-tab CT (its
// source module — the shell that stacked appearance over history — was deleted with the merge it existed
// to hold). The LOOK tab owns the field orientation now, so these belong beside the cluster they measure,
// and they mount `CharacterLookTabPanelStory`: the 463px context-panel width, which is the only mount
// where the density contract is observable at all.

test("F9 the theme rows are label-left/control-right in the context panel — not a swatch ladder", async ({ mount, page }) => {
  await route(page, null);
  await mount(<CharacterLookTabPanelStory />);

  const accentLabel = page.getByText("Accent", { exact: true });
  await expect(accentLabel).toBeVisible();
  const swatch = page.getByLabel("Accent");

  const labelBox = await accentLabel.boundingBox();
  const swatchBox = await swatch.boundingBox();
  if (labelBox === null || swatchBox === null) {
    throw new Error("theme row label/swatch did not render a box");
  }
  const readSwatchBoxAtAssertion = async (): Promise<NonNullable<Awaited<ReturnType<typeof swatch.boundingBox>>>> => {
    const box = await swatch.boundingBox();
    if (box === null) {
      throw new Error("theme row swatch lost its rendered box");
    }
    return box;
  };
  // Side by side (the swatch starts right of the label's right edge), not stacked.
  await expect.poll(async () => (await readSwatchBoxAtAssertion()).x).toBeGreaterThan(labelBox.x + labelBox.width);
  // …and on the same line: the two boxes overlap vertically.
  await expect.poll(async () => (await readSwatchBoxAtAssertion()).y).toBeLessThan(labelBox.y + labelBox.height);
});

// The theme cluster's header row carries THREE actions (the two theme doors + Reset). At the real panel
// width they do not fit beside the "Theme" label — the row wraps them onto their own line. Caught live
// during the TD build: before the wrap, "Reset to global" rendered as "Reset to glob", clipped by the panel
// edge. Asserted on the rendered box (the label list is not the defect; the geometry is).
test("no theme-cluster action clips the context panel's width", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: { accent: "#c98a5b" } }),
    "character.update": () => makeCharacterDetail({ themeOverride: { accent: "#c98a5b" } }),
    "character.listSnapshots": () => [],
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  const component = await mount(<CharacterLookTabPanelStory />);

  const panel = await component.boundingBox();
  if (panel === null) {
    throw new Error("the Look tab did not render a box");
  }
  const actions = ["Save as theme…", "Reset all to Inherit"];
  const boxes = await Promise.all(actions.map((action) => page.getByRole("button", { name: action }).boundingBox()));
  for (const [i, box] of boxes.entries()) {
    if (box === null) {
      throw new Error(`${actions[i]} did not render a box`);
    }
    expect(box.x + box.width, `${actions[i]} fits inside the panel`).toBeLessThanOrEqual(panel.x + panel.width);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 2026-08-30 SIDE-EYE DELTA PASS (#841) — the junk drawer and the colour-science leak.

// VERSION HISTORY IS NOT IN HERE ANY MORE. Measured before: `clientHeight 693 · scrollHeight 2253`, 31%
// visible, with the snapshot log LAST — theme editor → Background → a three-paragraph Trust essay → History,
// ~1560px down a 384px column. "Can I undo what I just did to this character" had no guessable door. The
// pin is the ABSENCE of the log's own affordance from this panel; its presence as a TAB is pinned in
// characters-section.ct.tsx (a tab strip is the thing that has to hold it, and that is where it lives).
test("#841 the Look tab no longer carries the snapshot log", async ({ mount, page }) => {
  await route(page, null);
  const component = await mount(<CharacterLookTabPanelStory />);

  // The tab still owns the LOOK — this is a split, not a gutting: the theme cluster and the carried
  // background are what "Look" names, and they are both still here.
  await expect(page.getByText("Accent", { exact: true })).toBeVisible();
  // The Background cluster by its SECTION heading — the word also names a theme colour field and the
  // background picker's own label, so a bare text match resolves three nodes.
  await expect(component.getByRole("heading", { name: "Background" })).toBeVisible();
  // …and the two concerns that earned their own doors are gone from here: the snapshot log (a versioning
  // question, 1560px down) and the Trust essay (a security one).
  await expect(page.getByRole("button", { name: "Snapshot now" })).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "HTML rendering" })).toHaveCount(0);
});

// SIX RAW `oklch(0.85 0.1 62)` STRINGS WERE THE USER-FACING VALUES of this panel's colour fields, beside
// one field reading `Inherit` that was perfectly legible. The readout's job is to distinguish a field the
// card SETS from one it inherits; a word does that as well as a colour-science triple and can be read.
// The seeded themes are authored in oklch, so this was the RESTING state of every card carrying a look.
test("#841 a colour field's value reads as words, never as an oklch() triple", async ({ mount, page }) => {
  const card = makeCharacterDetail({ themeOverride: { accent: "oklch(0.75 0.12 68)", background: "#221a14" } });
  await routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "character.listSnapshots": () => [],
    "settings.listThemes": () => THEME_LIST,
    // The BG-C picker's grid reads the viewer's own backgroundLibrary (#866 S4) — fed empty, never inert.
    "settings.getUserSettings": () => ({ userId: "user_ct_look", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  const component = await mount(<CharacterLookTabPanelStory />);

  await expect(page.getByText("Accent", { exact: true })).toBeVisible();
  // Nothing on the panel prints the notation. `innerText` is the whole rendered surface — the strongest
  // form of this claim, and the one that stays true if a new colour row is added.
  await expect(component).not.toContainText(OKLCH_RE);
  // A set-but-unreadable value says so in a word…
  await expect(component.getByText("Custom", { exact: true }).first()).toBeVisible();
  // …a HEX is legible as-is, so it survives verbatim (it is also what the popover's own hex field takes)…
  await expect(component.getByText("#221a14", { exact: true })).toBeVisible();
  // …and `Inherit`, the one readout that always worked, is untouched.
  await expect(component.getByText("Inherit", { exact: true }).first()).toBeVisible();
});
