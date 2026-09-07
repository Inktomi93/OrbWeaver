// CT: the config host's ONE aggregate save-status footer (SET-SEAMS §3 / pin P4). Drives the PRODUCTION
// composition (the real host + the real contributed sections through the real registry), never a stand-in:
// the precedence fold surfacing a section's failure, the failing section staying LOCATABLE (its own inline
// retry at its anchor + a nav-row marker), and the footer's locate-don't-retry affordance (D41).
//
// The report/degrade halves ride their own mirrors: tests/client/forms/save-status-seam.ct.tsx (hosted vs
// unhosted) and tests/client/forms/section-save-status.ct.tsx (the inline error arm + the section's retry).

import { PROSE_MAX_CHARS, PROSE_SLOTS } from "@orb/contracts/prose";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { ReactElement } from "react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_save_status",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

/** The config host's viewer-identity read (#649) — the nav resolves the admin/owner-gated panes off it,
 *  and it is nobody's subject in this file. Unfed it resolved `routeTrpc`'s null, so the whole identity-gated
 *  nav pipeline ran INERT here. A plain `user` viewer is the un-privileged arm these save-status tests assume. */
const SHELL_VIEWER_ROUTE: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: SETTINGS_VIEW.userId, handle: "ct_save_status", globalRole: "user" },
  // The LIST paints every shelf, so the four collection bands read their rosters for the counts — fed empty
  // (the honest fresh-library arm) rather than left to routeTrpc's inert null.
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  // THE ARRIVAL DEFAULT MOUNTS A REAL GROUP (#925 ruling 4): a host with no deep link now lands on the first
  // group (Appearance) before these tests click their way to Chat behavior, and its Looks section reads the
  // theme library — so this file's mounts exercise that pipeline whether or not they are about it.
  "settings.listThemes": [],
};

/** The host at the chat-behavior group, whose contributed sections (memory ① · world-info ② · databank ④)
 *  all report into the host. `failSaves` makes every section save fail (the P4 error arm). */
async function openChatBehavior(mount: (c: ReactElement) => Promise<unknown>, page: Page, failSaves: boolean): Promise<void> {
  await routeTrpc(page, {
    ...SHELL_VIEWER_ROUTE,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => (failSaves ? trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }) : {}),
  });
  await mount(<ConfigHostStory />);
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
  const worldInfo = page.locator("#config-anchor-chat-behavior-world-info");
  await worldInfo.getByRole("textbox", { name: "Scan depth" }).focus();
  await worldInfo.getByRole("button", { name: "Increase" }).first().click();
}

test("ERROR: the aggregate flips to the failure, the failing section keeps its OWN inline retry, and its nav row is marked", async ({ mount, page }) => {
  await openChatBehavior(mount, page, true);

  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toContainText("failed to save");
  // Precedence: error WINS over the sibling sections still reporting "saved".
  await expect(footer).not.toContainText("Synced across your devices.");

  // The failure is LOCATABLE: the section renders its own inline status + a real retry at its anchor…
  const inline = page.locator('#config-anchor-chat-behavior-world-info [data-slot="autosave-status"]');
  await expect(inline).toContainText("Save failed");
  await expect(inline.getByRole("button", { name: "Retry" })).toBeVisible();
  // …and its nav row carries the marker (the row's accessible description, not a bare icon).
  // `exact`: the World Info collection BAND ("World Info 0") is a button too since #1099 F5, and the default
  // role-name match is a case-insensitive substring. The marker rides the section ROW.
  await expect(page.getByRole("button", { name: "World info", exact: true })).toContainText("Save failed");
  // The aggregate NEVER offers a retry — it locates (D41).
  await expect(footer.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("ERROR: the footer's locator jumps to the failing section's anchor", async ({ mount, page }) => {
  await openChatBehavior(mount, page, true);
  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toContainText("failed to save");
  // Scroll away first so the jump has real work to do.
  // The nav ROW, whose label is the section's `navLabel` ("Chat & message handling" is the heading).
  await page.getByRole("button", { name: "Message handling" }).click();
  await footer.getByRole("button", { name: "Show me" }).click();
  await expect(page.locator("#config-anchor-chat-behavior-world-info")).toBeInViewport();
});

// ── THE HELD WRITE (side-eye PROSE-LIMIT P2) ──────────────────────────────────────────────────────────
// A hosted section renders NO inline status outside `error`, so this footer is the WHOLE save affordance for
// a decomposed pane — and it read "Saved · Synced across your devices." while a contributed section's own
// validator was refusing the write (the over-cap prose override: `proseOverridesSchema` heals it to absent,
// so the editor holds the save rather than deleting the host's wording). The one line whose job is to say
// whether this pane is saved said the opposite. Driven through the PRODUCTION composition — the real shell,
// the real prose section, the real autosave driver — because the lie only exists in the hosted arm.
const ARBITER_SLOT = "chat.arbiter.system";
const ARBITER_FIELD = PROSE_SLOTS[ARBITER_SLOT].title;
const PROSE_ANCHOR = "#config-anchor-chat-behavior-prose";

test("BLOCKED: a section holding its write flips the footer off 'Saved' and stays locatable", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_VIEWER_ROUTE,
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: {
        ...DEFAULT_USER_SETTINGS,
        // Longer than the cap can ever be TYPED — the shape only pre-existing data has, and exactly what the
        // editor refuses rather than silently deleting.
        prose: { [ARBITER_SLOT]: { text: "y".repeat(PROSE_MAX_CHARS + 500), baseVersion: PROSE_SLOTS[ARBITER_SLOT].version } },
      },
    }),
    [UPDATE_PROC]: () => ({}),
  });
  await mount(<ConfigHostStory />);
  await page.getByRole("button", { name: "Chat behavior" }).click();
  await page.getByRole("heading", { name: "World info" }).waitFor();

  // A real edit on the over-cap override — the author starts trimming, the driver refuses the write.
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await arbiter.press("End");
  await arbiter.press("Backspace");

  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toContainText("Not saved");
  await expect(footer).not.toContainText("Synced across your devices.");
  // POLITE, not an alert: nothing failed — a write is waiting on the author, and the field carrying the
  // reason does its own announcing.
  await expect(footer).toHaveAttribute("role", "status");
  // No second inline copy at the section: its own FIELD error is the locality (the stacked-footer smear this
  // seam exists to prevent), so the aggregate states it once and offers the jump.
  await expect(page.locator(`${PROSE_ANCHOR} [data-slot="autosave-status"]`)).toHaveCount(0);

  await page.getByRole("button", { name: "Message handling" }).click();
  await footer.getByRole("button", { name: "Show me" }).click();
  await expect(page.locator(PROSE_ANCHOR)).toBeInViewport();
});

// ── THE RECEIPT LANDS WHERE THE EYE IS (#1099 F25 / N52) ──────────────────────────────────────────────
// The footer was a bare SIBLING of the padded content scroller, so the one save receipt on the surface
// rendered 24px OUTSIDE the content column at the smallest step in the type ramp. Both halves are measured
// here, on the REAL column, against RESOLVED tokens — a hardcoded px would pin the accident, not the rule.

test("SAVED: the receipt is on the content grid — same inline start as the sections it reports on", async ({ mount, page }) => {
  await openChatBehavior(mount, page, false);
  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toContainText("Saved");
  // ONE inline grid: the column declares the inset once, so both children start at the same x. RETRYING,
  // because a box read taken the instant the receipt appears samples a pane that is still settling.
  await expect
    .poll(async () => {
      const receipt = await footer.boundingBox();
      const section = await page.locator("#config-anchor-chat-behavior-world-info").boundingBox();
      return receipt === null || section === null ? Number.POSITIVE_INFINITY : Math.abs(receipt.x - section.x);
    })
    .toBeLessThanOrEqual(0.5);
});

test("SAVED: the receipt is at the READING step, not the bottom of the ramp", async ({ mount, page }) => {
  await openChatBehavior(mount, page, false);
  await bumpScanDepth(page);

  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toContainText("Saved");
  // Both verdicts are computed against the RESOLVED tokens inside the page (a rem→px conversion by hand
  // would drift with the root size), and the whole read RETRIES — the footer's own text step is settled by
  // the barrier above, but the surrounding pane is still mounting sections.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const resolve = (token: string): number => {
            const probe = document.createElement("div");
            probe.style.fontSize = `var(${token})`;
            document.body.append(probe);
            const px = Number.parseFloat(getComputedStyle(probe).fontSize);
            probe.remove();
            return px;
          };
          const node = document.querySelector('[data-slot="config-save-footer"] p');
          const actual = node === null ? 0 : Number.parseFloat(getComputedStyle(node).fontSize);
          return { atTheLabelStep: Math.abs(actual - resolve("--text-label")) < 0.5, aboveTheSmallestStep: actual > resolve("--text-micro") };
        }),
    )
    .toEqual({ atTheLabelStep: true, aboveTheSmallestStep: true });
});
