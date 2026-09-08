// CT: <SectionSaveStatus> (SET-SEAMS §3) — the ONE status affordance a self-owned settings section
// renders. Its contract is the ERROR arm: even while HOSTED (where it renders nothing in saved/saving), a
// failing section renders inline AT ITS OWN ANCHOR with a real retry, because retry belongs to the session
// that owns the edit (D41 — surface the failure where it happened; the aggregate never retries).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../../features/config/_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_section_status",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};
const UPDATE_PROC = "settings.updateUserSettingsSection";
/** The viewer identity every settings-shell mount resolves for pane nav (`sessions.me`, e.g.
 *  `use-settings-viewer-view.ts`) — feeding it runs that resolution for real instead of the no-data branch. */
const VIEWER = { userId: "user_ct_section_status", globalRole: "user", handle: "section_status" };

test("a failing section renders inline at its anchor WITH a retry, even while hosted", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }),
    "sessions.me": () => VIEWER,
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    "settings.listThemes": [],
  });
  await mount(<ConfigHostStory />);
  await page.getByRole("button", { name: "Chat behavior" }).click();
  await page.getByRole("heading", { name: "World info" }).waitFor();

  // SCOPED to the world-info anchor: an unscoped `Increase.first()` resolves to whichever stepper is highest
  // in the PANE, and the message-handling section above renders a deliberately DISABLED one
  // (`autoContinueRounds` while auto-continue is off, `663b956b`), which can never be clicked.
  const worldInfo = page.locator("#config-anchor-chat-behavior-world-info");
  await worldInfo.getByRole("textbox", { name: "Scan depth" }).focus();
  await worldInfo.getByRole("button", { name: "Increase" }).first().click();

  const inline = worldInfo.locator('[data-slot="autosave-status"]');
  await expect(inline).toContainText("Save failed");
  const retry = inline.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  // The retry is the SECTION's own: it re-fires that section's write, never a broadcast.
  const before = trpc.count(UPDATE_PROC);
  await retry.click();
  await expect.poll(() => trpc.count(UPDATE_PROC), { intervals: [20, 50, 100] }).toBeGreaterThan(before);
  // ONESHOT-OK: the poll above already settled the recorder — this reads the call it just observed.
  expect((trpc.lastInput(UPDATE_PROC) as { section?: string } | undefined)?.section).toBe("worldInfo");
});
