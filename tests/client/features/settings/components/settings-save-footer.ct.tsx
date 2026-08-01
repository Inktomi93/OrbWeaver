// CT: the settings shell's ONE aggregate save-status footer (SET-SEAMS §3 / pin P4). Drives the PRODUCTION
// composition (the real shell + the real contributed sections through the real registry), never a stand-in:
// the precedence fold surfacing a section's failure, the failing section staying LOCATABLE (its own inline
// retry at its anchor + a nav-row marker), and the footer's locate-don't-retry affordance (D41).
//
// The report/degrade halves ride their own mirrors: tests/client/forms/save-status-seam.ct.tsx (hosted vs
// unhosted) and tests/client/forms/section-save-status.ct.tsx (the inline error arm + the section's retry).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { ReactElement } from "react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { SettingsShellStory } from "../_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_save_status",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

/** The shell at the chat-behavior pane, whose contributed sections (memory ① · world-info ② · databank ④)
 *  all report into the host. `failSaves` makes every section save fail (the P4 error arm). */
async function openChatBehavior(mount: (c: ReactElement) => Promise<unknown>, page: Page, failSaves: boolean): Promise<void> {
  await routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => (failSaves ? trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }) : {}),
  });
  await mount(<SettingsShellStory />);
  await page.getByRole("button", { name: "Chat behavior" }).click();
  await page.getByRole("heading", { name: "World info" }).waitFor();
}

/** Move a world-info knob (its autosave fires, and fails under `failSaves`). SCOPED to the world-info
 *  ANCHOR: an unscoped `Increase.first()` resolves to whichever stepper is highest in the PANE, and the
 *  message-handling section above renders a deliberately DISABLED one (`autoContinueRounds` while
 *  auto-continue is off, `663b956b`) — the click then hangs on a button that can never be enabled.
 *  Scoping supersedes the focus+ArrowUp workaround (`f88954f8`): it drives the same control the user does,
 *  and it can't drift again the next time a section lands above this one. */
async function bumpScanDepth(page: Page): Promise<void> {
  const worldInfo = page.locator("#settings-anchor-chat-behavior-world-info");
  await worldInfo.getByRole("textbox", { name: "Scan depth" }).focus();
  await worldInfo.getByRole("button", { name: "Increase" }).first().click();
}

test("ERROR: the aggregate flips to the failure, the failing section keeps its OWN inline retry, and its nav row is marked", async ({ mount, page }) => {
  await openChatBehavior(mount, page, true);

  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="settings-save-footer"]');
  await expect(footer).toContainText("failed to save");
  // Precedence: error WINS over the sibling sections still reporting "saved".
  await expect(footer).not.toContainText("Synced across your devices.");

  // The failure is LOCATABLE: the section renders its own inline status + a real retry at its anchor…
  const inline = page.locator('#settings-anchor-chat-behavior-world-info [data-slot="autosave-status"]');
  await expect(inline).toContainText("Save failed");
  await expect(inline.getByRole("button", { name: "Retry" })).toBeVisible();
  // …and its nav row carries the marker (the row's accessible description, not a bare icon).
  await expect(page.getByRole("button", { name: "World info" })).toContainText("Save failed");
  // The aggregate NEVER offers a retry — it locates (D41).
  await expect(footer.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("ERROR: the footer's locator jumps to the failing section's anchor", async ({ mount, page }) => {
  await openChatBehavior(mount, page, true);
  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="settings-save-footer"]');
  await expect(footer).toContainText("failed to save");
  // Scroll away first so the jump has real work to do.
  // The nav ROW, whose label is the section's `navLabel` ("Chat & message handling" is the heading).
  await page.getByRole("button", { name: "Message handling" }).click();
  await footer.getByRole("button", { name: "Show me" }).click();
  await expect(page.locator("#settings-anchor-chat-behavior-world-info")).toBeInViewport();
});
