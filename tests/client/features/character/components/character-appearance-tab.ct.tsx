// CT: the §8.1 per-character THEME cluster in the CONTEXT Appearance tab (FINAL-Character §8). Drives the
// PRODUCTION path — `character.get` seeds the current override, `character.update` is stubbed + recorded
// (routeTrpc). Asserts the three commit semantics that keep this lane from being built wrong (§2):
//   • IMMEDIATE-commit: an enum pick fires `character.update({ themeOverride })` at once (no save-bar).
//   • Per-field CLEAR: picking Inherit on one control OMITS that field from the blob (the rest survive).
//   • Reset to global: sends `themeOverride: null` (drop the whole override → inherit the global theme).
//   • A debounced COLOUR edit still lands as one write carrying the picked colour.
// The write is the WHOLE merged blob (raw + unmerged — resolution is a `<ThemeScope>` nesting concern).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CharacterAppearanceTabStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

/** The `themeOverride` blob carried by the most recent `character.update` (or undefined if none). */
function lastThemeOverride(trpc: TrpcRecorder): unknown {
  const input = trpc.lastInput("character.update") as { input?: { themeOverride?: unknown } } | undefined;
  return input?.input?.themeOverride;
}

function route(page: Page, themeOverride: Record<string, unknown> | null): Promise<TrpcRecorder> {
  const card = makeCharacterDetail({ themeOverride });
  return routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
  });
}

test("§8.1 an enum pick is an IMMEDIATE commit — one field, the whole blob, no save-bar", async ({ mount, page }) => {
  const trpc = await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("combobox", { name: "Corner radius" }).click();
  await page.getByRole("option", { name: "Card", exact: true }).click();

  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ radius: "card" });
  // Immediate-commit surfaces never light a draft dirty pill (§2).
  await expect(page.getByText("Unsaved")).toHaveCount(0);
});

test("§8.1 per-field clear — picking Inherit OMITS that field, the others survive", async ({ mount, page }) => {
  const trpc = await route(page, { radius: "card", font: "Georgia" });
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("combobox", { name: "Font" }).click();
  await page.getByRole("option", { name: "Inherit", exact: true }).click();

  // font dropped from the blob → it inherits the parent scope; radius is untouched.
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ radius: "card" });
});

test("§8.1 Reset to global sends themeOverride: null", async ({ mount, page }) => {
  const trpc = await route(page, { radius: "card" });
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("button", { name: "Reset all to Inherit" }).click();
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toBeNull();
});

test("§8.1 Reset is disabled when there is no override to clear", async ({ mount, page }) => {
  await route(page, null);
  await mount(<CharacterAppearanceTabStory />);
  await expect(page.getByRole("button", { name: "Reset all to Inherit" })).toBeDisabled();
});

test("§8.1 a colour edit debounces into one write carrying the picked colour", async ({ mount, page }) => {
  const trpc = await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

  await page.getByLabel("Accent").click();
  await page.getByLabel("Hex").fill("#00ff00");

  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ accent: "#00ff00" });
});

// ── The card-embeddable partition: a card carries IDENTITY, never the viewer's ERGONOMICS (TD §3) ─────
// `chatStyle` and `density` are VIEWER-SACRED: the row skin reads `appearance.chatStyle` only and the
// single `[data-density]` selector is the shell grid's (a nested scope's attribute matches nothing), so a
// card control for either governed NOTHING — the D107 dead-switch class. The controls are struck; the
// partition (`CARD_EMBEDDABLE_THEME_KEYS`) is what keeps them from coming back.

test("the card cannot force viewer ergonomics — no Message style / Density control (D107)", async ({ mount, page }) => {
  await route(page, { radius: "card" });
  await mount(<CharacterAppearanceTabStory />);
  // The sibling Type & shape controls still render — proof the cluster mounted and the absence is real.
  await expect(page.getByRole("combobox", { name: "Corner radius" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message style" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Density" })).toHaveCount(0);
});

// ── The two theme DOORS (TD §2) — promote the card's look into the picker, and seed it from a theme ───

const THEME_LIST = [
  {
    id: "theme_00000000000000000000000002",
    name: "Mocha",
    override: { background: "oklch(0.15 0.015 250)", accent: "oklch(0.7 0.14 250)", density: "compact" },
    css: null,
    isSeed: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

test("Save as theme… promotes the LIVE override, defaulted to the character's name", async ({ mount, page }) => {
  const card = makeCharacterDetail({ themeOverride: { accent: "#00ff00" } });
  const trpc = await routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "settings.listThemes": () => THEME_LIST,
    "settings.promoteTheme": () => ({ id: "theme_new", name: "Aria", override: { accent: "#00ff00" }, css: null, isSeed: false, createdAt: 0, updatedAt: 0 }),
  });
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("button", { name: "Save as theme…" }).click();
  await expect.poll(() => trpc.lastInput("settings.promoteTheme"), { intervals: [20, 50, 100] }).toEqual({ name: "Aria", override: { accent: "#00ff00" } });
});

test("Save as theme… is disabled while the card has nothing of its own to promote", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: null }),
    "character.update": () => makeCharacterDetail({ themeOverride: null }),
    "settings.listThemes": () => THEME_LIST,
  });
  await mount(<CharacterAppearanceTabStory />);
  await expect(page.getByRole("button", { name: "Save as theme…" })).toBeDisabled();
});

test("Start from a theme… seeds the card from the theme's CARD-EMBEDDABLE subset (density never rides)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: null }),
    "character.update": () => makeCharacterDetail({ themeOverride: null }),
    "settings.listThemes": () => THEME_LIST,
  });
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("combobox", { name: "Start from a theme" }).click();
  await page.getByRole("option", { name: "Mocha", exact: true }).click();

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
  await mount(<CharacterAppearanceTabStory />);

  await expect(page.getByRole("combobox", { name: "External media" })).toBeDisabled();
  await expect(page.getByText(LOCK_COPY_RE)).toBeVisible();
  // The sibling Trust control is a DIFFERENT axis (trustHtml escalation stays per-character) — untouched.
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});

test("deployment ALLOWS external media → the control is live and the lock copy is absent", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

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
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await expect(page.getByRole("option")).toHaveText(["Inherit default", "Untrusted", "Render HTML", "Interactive"]);
});

test("picking Interactive WRITES the render trust it implies — the incoherent pair is unwritable (#111)", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  const trpc = await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("combobox", { name: "HTML rendering" }).click();
  await page.getByRole("option", { name: "Interactive", exact: true }).click();

  await expect.poll(() => lastUpdateInput(trpc), { intervals: [20, 50, 100] }).toEqual({ trustHtml: true, interactiveHtml: true });
});

test("the lower rungs write the pair too — Render HTML is trusted-but-static, Untrusted is the floor", async ({ mount, page }) => {
  await stubExternalMediaBlocked(page, false);
  const trpc = await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

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
  const trpc = await routeTrpc(page, { "character.get": () => card, "character.update": () => card });
  await mount(<CharacterAppearanceTabStory />);

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
  await mount(<CharacterAppearanceTabStory />);

  await expect(page.getByText(LADDER_COPY_RE)).toBeVisible();
  await expect(page.getByText(CEILING_DOWN_COPY_RE)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});

test("ceiling DOWN (the shipped floor) → the tab says the rung is inert, and still lets you pick it", async ({ mount, page }) => {
  await stubDeployment(page, { externalMediaBlocked: false });
  await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

  // The honest note names the remedy and where it lives — the D107 no-dead-switch posture, said in copy
  // rather than by disabling, because the other three rungs still work.
  await expect(page.getByText(CEILING_DOWN_COPY_RE)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
  // …and the rung is still WRITABLE: a host may opt a card in ahead of the admin flip, which is exactly
  // what the stored-consent model expects (the mint re-checks the ceiling on every card it builds).
  await expect(page.getByRole("combobox", { name: "HTML rendering" })).toBeEnabled();
});
