// CT: the notifications chrome entry's VISIBILITY — what the topbar trail paints, and WHEN.
//
// #1627 RETIRED THE GATE THIS FILE WAS BORN FOR. The entry used to hide the bell unless the deployment was
// multi-human capable (PD-106: every notification SOURCE was invite/kick/host-handoff), and #476 then spent a
// device-local boot hint on making that gate answer in the first frame instead of mounting the bell INTO the
// trail 90ms late. Both premises are gone: `plugin-disabled` (a plugin the crash policy auto-disabled) and
// `automation-notice` (a rule that auto-disabled itself) write durable rows on a single-user deployment, and
// #1041's plugin-consent prompt joins them — so the inbox is a SINGLE-human surface too and the bell is
// unconditional for an authed principal. An unconditional widget cannot flash, cannot yank, and cannot shift
// the trail, which is why the #476 assertions are gone rather than rewritten.
//
// What is pinned here now is the ANTI-REGRESSION: the bell paints in the first frame with `/api/auth/config`
// still in flight, it paints when the deployment ANSWERS single-human, and it paints on a device that
// REMEMBERS a single-human deployment — the three arms a resurrected capability gate would fail. It stays a
// CT rather than a unit test for the same reason it always was: the claim is about a RENDERED first frame
// with the config withheld.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
// The bus's OWN transport mutations (#649). `stream.attach`/`detach` ride the BATCHED HTTP link, not the
// SSE leg (`use-orb-socket.ts:7,139` — only `stream.connect` is the subscription), so `routeOrbSocket`
// never answers them and they rode `routeTrpc`'s lenient null in every mount here. Imported from the bus's
// own fixture module rather than re-spelled, so the two directions of this feed cannot drift apart.
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { NotificationsSheetBadgeStory, NotificationsTrailStory } from "../_ct-stories.tsx";

type InboxRow = TrpcWireOutput<"notifications.list">["items"][number];

/** The deployment-boot hint's own key (`createPersistedStore("deployment-boot")`) on a browser with no
 *  identity bound. Still seeded by one test below: a device that remembers "single human" is exactly the
 *  device the retired gate hid the bell from, so it is the sharpest resurrection detector. */
const HINT_KEY = "orb:deployment-boot";

/** Seed this device's remembered capability BEFORE the page's modules run, then boot into it (a persisted
 *  store rehydrates at MODULE INIT — writing localStorage after mount would prove nothing about a boot). */
async function seedHint(page: Page, multiHumanCapable: boolean): Promise<void> {
  const blob = JSON.stringify({ state: { multiHumanCapable }, version: 1 });
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(HINT_KEY)}, ${JSON.stringify(blob)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

/** Hold `/api/auth/config` in flight; the returned fn lands the deployment's answer when the test wants it.
 *  The boot window under test is the one where it has NOT landed. */
async function routeAuthConfig(page: Page): Promise<(multiHumanCapable: boolean) => void> {
  let land: ((capable: boolean) => void) | undefined;
  const answered = new Promise<boolean>((resolve) => {
    land = resolve;
  });
  await page.route("**/api/auth/config", async (route) => {
    const multiHumanCapable = await answered;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "local", multiHumanCapable }) });
  });
  return (capable: boolean): void => land?.(capable);
}

/** The bell's own reads — an empty inbox, so its accessible name is the bare "Notifications". */
async function routeInbox(page: Page): Promise<void> {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 0 }),
  });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
}

const BELL = { name: "Notifications", exact: true } as const;

test("the bell paints in the FIRST frame — the trail no longer waits on /api/auth/config", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);

  const trail = await mount(<NotificationsTrailStory />);

  // The config is STILL in flight. Under the retired gate a fresh device painted NOTHING here.
  await expect(trail.getByRole("button", BELL)).toBeVisible();
  land(true);
  await expect(trail.getByRole("button", BELL)).toBeVisible();
});

test("a SINGLE-HUMAN deployment gets the bell: its inbox has sources of its own (#1627)", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);

  const trail = await mount(<NotificationsTrailStory />);
  await expect(trail.getByRole("button", BELL)).toBeVisible();

  // The deployment answers "I cannot seat a second human" — and the bell stays, because a disabled plugin
  // and an auto-disabled automation rule both post to this inbox on exactly such a box.
  land(false);
  await expect(trail.getByRole("button", BELL)).toBeVisible();
});

test("a device that REMEMBERS a single-human deployment paints the bell too — no hint gates it", async ({ mount, page }) => {
  await routeInbox(page);
  const land = await routeAuthConfig(page);
  await seedHint(page, false);

  const trail = await mount(<NotificationsTrailStory />);

  // The exact device the retired gate hid the bell from, in the exact frame it hid it in.
  await expect(trail.getByRole("button", BELL)).toBeVisible();
  land(false);
  await expect(trail.getByRole("button", BELL)).toBeVisible();
});

// ── THE PHONE'S TELL IS `unread || actionable` (#1815, owner ruling ARM A) ────────────────────────────
// THE DEFECT: the You tab's badge was `useInbox().unreadCount`, and the sheet lens marks EVERY row read on
// mount (`NotificationBell presentation="sheet"` — its "you looked" moment is the mount, because a sheet has
// no open event). So on a phone the sequence was: a tell appears, you open the sheet to see why, and the
// tell is gone — with the invite that raised it still sitting there undecided, and no way back to it except
// remembering. On the desktop the same reader keeps their dot (#1799). This is that fix, on the phone.
//
// The probe calls `notificationsChrome.useBadge()` itself rather than reading a rendered tab, deliberately:
// app-shell may not import this feature, so the registry contribution IS the whole of what the tab can show,
// and a pin over the rendered `SheetBadgeCount` would be pinning app-shell's projection (rail.ct.tsx owns
// that half, including the dot and the spoken "N waiting").
//
// RED-FIRST RECEIPT (2026-09-06 — this block plus rail.ct's two swept assertions run against
// `git show HEAD:` of `rail.tsx` + `notifications-chrome.tsx` + `use-inbox.ts`, i.e. post-#1799 and
// pre-#1815; `CT SUMMARY — FAILED · 20 passed · 2 failed`):
//   ✘ a row still awaiting a decision keeps the tab's tell after the sheet has been opened
//       getByTestId('ct-sheet-badge')  Expected: "1"  Received: "0"
//       (…resolved to `<output data-testid="ct-sheet-badge">0</output>` — the sheet's mount marked the row
//        read, and the unread-only predicate had nothing left to say)
//   ✘ rail.ct.tsx › the You tab badges a sheet-hosted widget's waiting count
//       toHaveText  Expected: ""  Received: "3"   (the counted pill)
// THE OTHER TWO PINS HERE ARE FENCES, green in both regimes, and are labelled rather than counted:
// "a settled row leaves NO tell" (the old predicate was already quiet there — it pins that the widening
// did not become "any row at all") and "a row that is BOTH new and undecided counts once" (it pins the
// UNION against the tempting `unreadCount + pendingCount`, which no old code could have failed).
test.describe("the You tab's tell (#1815)", () => {
  /** An invite that has been READ and is still undecided: the row the old predicate lost. */
  function readPendingInvite(): InboxRow {
    return {
      id: "ntf_ct_pending",
      type: "invite",
      payload: { type: "invite", recipientUserId: "user_ct_invitee", chatId: "chat_ct_target", inviteId: "chatinvite_ct_1", invitedByHandle: "alex" },
      seq: 1,
      readAt: 1_750_000_000_001,
      dismissedAt: null,
      actionable: true,
      createdAt: 1_750_000_000_000,
    };
  }

  /** The same row once its decision has been settled elsewhere — the ask is gone, the row is not. */
  function readSettledInvite(): InboxRow {
    return { ...readPendingInvite(), actionable: false };
  }

  async function mountSheet(mount: (c: React.ReactElement) => Promise<unknown>, page: Page, rows: readonly InboxRow[]): Promise<void> {
    await routeTrpc(page, {
      ...STREAM_MUTATION_ROUTES,
      "notifications.list": () => ({ items: [...rows], nextCursor: null }),
      "notifications.markAllRead": () => ({ markedCount: 0 }),
    });
    await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
    await mount(<NotificationsSheetBadgeStory />);
  }

  test("a row still awaiting a decision keeps the tab's tell after the sheet has been opened", async ({ mount, page }) => {
    // The sheet is MOUNTED here, which is its mark-all-read moment — so this is the state a phone reader is
    // in after they have looked. The tell must still be there, because the decision still is.
    await mountSheet(mount, page, [readPendingInvite()]);

    await expect(page.getByTestId("ct-sheet-badge")).toHaveText("1");
    // …and the sheet really did render the row it is counting (the probe is not counting a phantom).
    await expect(page.getByText("alex invited you to a chat")).toBeVisible();
  });

  test("a settled row leaves NO tell, even though its inbox row is still there", async ({ mount, page }) => {
    // The other side of the same predicate, and why this is `actionable` rather than "is it an invite?":
    // an invite accepted from a share link or revoked by the host keeps its row and must go quiet.
    await mountSheet(mount, page, [readSettledInvite()]);

    await expect(page.getByText("alex invited you to a chat")).toBeVisible();
    await expect(page.getByTestId("ct-sheet-badge")).toHaveText("0");
  });

  test("a row that is BOTH new and undecided counts once", async ({ mount, page }) => {
    // The union, not the sum: a freshly-arrived invite is the commonest row in this inbox, and adding the
    // two halves would make the phone claim two things are waiting when one is.
    await mountSheet(mount, page, [{ ...readPendingInvite(), readAt: null }]);

    await expect(page.getByTestId("ct-sheet-badge")).toHaveText("1");
  });
});
