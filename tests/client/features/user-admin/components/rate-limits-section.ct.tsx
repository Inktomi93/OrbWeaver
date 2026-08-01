// CT: the Rate limits admin SECTION (Phase B ③ — rate-limits-section.tsx). Drives the production admin path:
// getAppSettingsWithOverrides seeds the fields (resolved floor + which are overridden), editing + Save fires
// updateAppSettings with the only-moved-fields rateLimits delta, and Reset clears the whole rateLimits
// override (`{ rateLimits: null }`). Asserts the mutation fired with the right patch shape (route recorder).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { setNumber } from "../../../../support/ct/set-number";
import { RateLimitsSectionStory } from "../_ct-stories";

// The resolved slice the section reads (getAppSettingsWithOverrides.resolved). Only `rateLimits` is read
// here; routeTrpc handler returns are untyped stubs, so a plain partial suffices (the admin-surface CT's
// APP_SETTINGS precedent — no cast, no fabricated whole-shape).
const RESOLVED = {
  rateLimits: { publicIp: 60, authed: 600, aiTurn: 30, login: 10 },
};

const UPDATE_PROC = "settings.updateAppSettings";

function stub(page: Page, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED, overrides }),
    [UPDATE_PROC]: () => RESOLVED,
  });
}

/** The most recent updateAppSettings `partial` body. */
function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined;
  return input?.partial;
}

test("mounts with the resolved floors and shows the default beneath each field", async ({ mount, page }) => {
  await stub(page);
  await mount(<RateLimitsSectionStory />);
  await expect(page.getByRole("textbox", { name: "Anonymous requests / min / IP" })).toHaveValue("60");
  await expect(page.getByRole("textbox", { name: "Login attempts / min / IP" })).toHaveValue("10");
  await expect(page.getByText("Using the deployment default: 10.")).toBeVisible();
});

test("editing login + Save fires updateAppSettings with ONLY the moved field", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RateLimitsSectionStory />);
  await setNumber(page.getByRole("textbox", { name: "Login attempts / min / IP" }), "25");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => (lastPartial(trpc)?.["rateLimits"] as Record<string, unknown> | undefined)?.["login"], { intervals: [20, 50, 100] }).toBe(25);
  // Untouched fields are NOT pinned into the override.
  expect((lastPartial(trpc)?.["rateLimits"] as Record<string, unknown>)?.["authed"]).toBeUndefined();
});

test("a below-min cap is CLAMPED to the floor, never sent raw (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RateLimitsSectionStory />);
  // Caps are bounded ≥5; typing 1 must clamp to 5 (a raw 1 would fail `.min(5)` → the whole rateLimits
  // `.catch(undefined)` would silently wipe every cap override).
  await setNumber(page.getByRole("textbox", { name: "Login attempts / min / IP" }), "1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => (lastPartial(trpc)?.["rateLimits"] as Record<string, unknown> | undefined)?.["login"], { intervals: [20, 50, 100] }).toBe(5);
});

test("an active override shows 'Overridden' and Reset clears the whole rateLimits override to the floor", async ({ mount, page }) => {
  const trpc = await stub(page, { rateLimits: { login: 25 } });
  await mount(<RateLimitsSectionStory />);
  // An env-layered floor is NOT nameable once an override is stored: the real `getAppSettingsWithOverrides`
  // returns floor ⊕ override, so "Default: 10." would be the override describing itself (SET-SEAMS §4). The
  // row points at Reset instead — which is also the affordance that recovers the floor.
  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc)?.["rateLimits"], { intervals: [20, 50, 100] }).toBeNull();
});
