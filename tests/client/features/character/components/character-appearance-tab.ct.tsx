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
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterAppearanceTabStory } from "../_ct-stories";
import { makeCharacterDetail } from "../fixtures";

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
  await page.getByRole("option", { name: "Inherit global", exact: true }).click();

  // font dropped from the blob → it inherits the parent scope; radius is untouched.
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ radius: "card" });
});

test("§8.1 Reset to global sends themeOverride: null", async ({ mount, page }) => {
  const trpc = await route(page, { radius: "card" });
  await mount(<CharacterAppearanceTabStory />);

  await page.getByRole("button", { name: "Reset to global" }).click();
  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toBeNull();
});

test("§8.1 Reset is disabled when there is no override to clear", async ({ mount, page }) => {
  await route(page, null);
  await mount(<CharacterAppearanceTabStory />);
  await expect(page.getByRole("button", { name: "Reset to global" })).toBeDisabled();
});

test("§8.1 a colour edit debounces into one write carrying the picked colour", async ({ mount, page }) => {
  const trpc = await route(page, null);
  await mount(<CharacterAppearanceTabStory />);

  await page.getByLabel("Accent").click();
  await page.getByLabel("Hex").fill("#00ff00");

  await expect.poll(() => lastThemeOverride(trpc), { intervals: [20, 50, 100] }).toEqual({ accent: "#00ff00" });
});

// ── Trust: the external-media control must not LIE (owner ruling 2026-08-01) ──────────────────────────
// The deployment "Block external media" setting is the ABSOLUTE ceiling: the server-side render-policy
// resolver is tighten-only and the document CSP is built from the deployment value alone, so while it is
// on, EVERY value of this per-character control resolves to blocked. It therefore renders DISABLED with the
// reason said out loud, never as a live-looking "Allow" (D107 — no dead switches). The deployment verdict
// rides `/api/auth/config.forbidExternalMedia`, stubbed here at the network boundary — the honest source.

async function stubExternalMediaBlocked(page: Page, blocked: boolean): Promise<void> {
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
        forbidExternalMedia: blocked,
      }),
    }),
  );
}

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
