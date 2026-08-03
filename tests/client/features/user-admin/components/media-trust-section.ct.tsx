// CT: the Media & trust admin SECTION (SET-SEAMS stage 4 — the first of the five the retired System pane
// decomposed into). Pins the two stage-4 promises for this section: P1 PATCH KEY-MINIMALITY (a write names
// this section's keys and NOTHING else — the System pane used to send a delta computed over the whole
// config), and the OVERRIDE-vs-FLOOR honesty that replaced the pane's footnote (a row says which one it is,
// and never prints a stored override as if it were the default).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { setNumber } from "../../../../support/ct/set-number.ts";
import { MediaTrustSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateAppSettings";
const BYTES_PER_MB = 1_000_000;

/** The resolved slice this section reads (floor ⊕ override); untyped route stubs, so a partial suffices. */
const RESOLVED = {
  forbidExternalMedia: true,
  trustHtml: false,
  maxImageBytes: 5 * BYTES_PER_MB,
};

function stub(page: Page, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED, overrides }),
    [UPDATE_PROC]: () => RESOLVED,
  });
}

/** The most recent override PARTIAL sent to `updateAppSettings`. */
function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("mounts on the resolved values and stamps its own admin anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<MediaTrustSectionStory />);

  await expect(page.getByRole("switch", { name: "Block external media" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Render rich HTML as trusted" })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)" })).toHaveValue("5");
  await expect(page.locator("#settings-anchor-admin-media-trust")).toBeVisible();
});

// P1 — the patch names ONLY this section's key. `toStrictEqual` is the point: a sibling key riding along
// (the pane-era whole-config delta) is a lost update the instant two sections save at once.
test("toggling a switch patches EXACTLY that key — no sibling, no whole-config delta", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MediaTrustSectionStory />);

  await page.getByRole("switch", { name: "Render rich HTML as trusted" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ trustHtml: true });
});

test("the MB field saves BYTES, alone", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MediaTrustSectionStory />);

  await setNumber(page.getByRole("textbox", { name: "Max generated-image download (MB)" }), "6");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ maxImageBytes: 6 * BYTES_PER_MB });
});

// The override-vs-floor story, arm 1: nothing stored ⇒ the resolved value IS the floor, so the row names it.
test("a row on the floor NAMES the deployment default", async ({ mount, page }) => {
  await stub(page);
  await mount(<MediaTrustSectionStory />);

  await expect(page.getByText("Using the deployment default: on.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset to defaults" })).toHaveCount(0);
});

// Arm 2: with a stored override the env floor is NOT recoverable client-side, so the row must not fake one —
// printing the resolved value as "Default: …" would be the override describing itself (the pane-era footnote
// dishonesty in miniature). Reset appears here, and clears exactly this section's three keys.
test("an overridden row admits it without faking a default, and Reset clears exactly this section's keys", async ({ mount, page }) => {
  const trpc = await stub(page, { trustHtml: true });
  await mount(<MediaTrustSectionStory />);

  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ forbidExternalMedia: null, trustHtml: null, maxImageBytes: null });
});
