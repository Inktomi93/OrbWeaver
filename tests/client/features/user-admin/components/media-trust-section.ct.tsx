// CT: the Media & trust admin SECTION (SET-SEAMS stage 4 — the first of the five the retired System pane
// decomposed into). Pins the two stage-4 promises for this section: P1 PATCH KEY-MINIMALITY (a write names
// this section's keys and NOTHING else — the System pane used to send a delta computed over the whole
// config), and the OVERRIDE-vs-FLOOR honesty that replaced the pane's footnote (a row says which one it is,
// and never prints a stored override as if it were the default).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { setNumber } from "../../../../support/node/set-number.ts";
import { MediaTrustSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateAppSettings";
const BYTES_PER_MB = 1_000_000;

/** The resolved slice this section reads (floor ⊕ override); untyped route stubs, so a partial suffices. */
const RESOLVED = {
  forbidExternalMedia: true,
  trustHtml: false,
  // #111 leg 3 — the interactive-card kill-switch, mounted here at its SHIPPED floor (off).
  allowInteractiveCards: false,
  maxImageBytes: 5 * BYTES_PER_MB,
};

const INTERACTIVE_SWITCH = "Let interactive cards run their own scripts";
/** The disclosure clause. Pinned because it is the ONLY place an admin is told the grant's residual cannot
 *  be taken back by policy — softening it later would make this a plain feature toggle. */
const WEBRTC_DISCLOSURE_RE = /beacon out over WebRTC, which no browser policy can block/u;

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
  // #111 leg 3 — the deployment kill-switch for card scripts, and it renders OFF on the shipped floor.
  await expect(page.getByRole("switch", { name: INTERACTIVE_SWITCH })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)" })).toHaveValue("5");
  await expect(page.locator("#config-anchor-admin-media-trust")).toBeVisible();
});

// The kill-switch is the ONLY control over the grant's WebRTC residual, so its copy has to name that cost
// rather than reading as a feature toggle — an admin who flips it is consenting to something a CSP cannot
// take back, and this is the surface where they find that out.
test("the interactive-cards switch names the residual its copy exists to disclose", async ({ mount, page }) => {
  await stub(page);
  await mount(<MediaTrustSectionStory />);

  // The row's hint rides the `HintTrigger` tooltip (`@orb/ui/field`), so the disclosure is one hover away
  // rather than inline — same affordance every other admin hint uses.
  await page.getByRole("button", { name: `More info about ${INTERACTIVE_SWITCH}` }).hover();
  await expect(page.getByText(WEBRTC_DISCLOSURE_RE)).toBeVisible();
});

test("flipping the interactive-cards switch patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MediaTrustSectionStory />);

  await page.getByRole("switch", { name: INTERACTIVE_SWITCH }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ allowInteractiveCards: true });
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
// dishonesty in miniature). Reset appears here, and clears exactly this section's four keys — a Reset that
// forgot one would leave a stale override behind, and for `allowInteractiveCards` that means a card-script
// grant surviving an admin's "put everything back".
test("an overridden row admits it without faking a default, and Reset clears exactly this section's keys", async ({ mount, page }) => {
  const trpc = await stub(page, { trustHtml: true });
  await mount(<MediaTrustSectionStory />);

  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect
    .poll(() => lastPartial(trpc), { intervals: [20, 50, 100] })
    .toStrictEqual({ forbidExternalMedia: null, trustHtml: null, allowInteractiveCards: null, maxImageBytes: null });
});
