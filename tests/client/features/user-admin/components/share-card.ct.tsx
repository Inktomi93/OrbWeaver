// CT: the owner's Share card, mounted inside the real Multi-user section. It proves the precondition rows and their
// fixes, the link and its copy button on `up`, and the "link changed" notice when the relay returns under a new URL.
// Assertions ride roles and the card's data attributes; no copy is asserted.

import type { AuthMode, ShareStatus } from "@orb/contracts/identity";
import { copyActionName } from "@orb/ui/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { GovernanceSectionsStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";
import { stubAuthConfig } from "../auth-config-fixtures.ts";

const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;
const DELEGATED_ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" } satisfies TrpcWireOutput<"sessions.me">;

const FIRST_URL = "https://first-words-here.trycloudflare.com";
const SECOND_URL = "https://other-words-now.trycloudflare.com";

const OFF: ShareStatus = { relay: { state: "off" }, liveSocketCount: 0 };
const UP_FIRST: ShareStatus = { relay: { state: "up", relay: "quick", url: FIRST_URL }, liveSocketCount: 3 };
const UP_SECOND: ShareStatus = { relay: { state: "up", relay: "quick", url: SECOND_URL }, liveSocketCount: 1 };

const SEATING_ON: Partial<EffectiveAppSettings> = { localMultiUser: true, discreetLogin: true };
const SEATING_OFF: Partial<EffectiveAppSettings> = { localMultiUser: false, discreetLogin: false };

type ListedUser = TrpcWireOutput<"admin.listUsers">[number];

function user(id: string, role: ListedUser["role"]): ListedUser {
  return { id, handle: id, externalId: null, role, enabled: true, kind: "human", ownerHandle: null, createdAt: 0, updatedAt: 0 };
}

interface ShareStub {
  readonly mode: AuthMode;
  readonly viewer?: TrpcWireOutput<"sessions.me">;
  readonly resolved?: Partial<EffectiveAppSettings>;
  /** The status the server holds before any verb runs. */
  readonly initial: ShareStatus;
  /** What `share.start` makes the server hold next, in call order; `null` refuses that call. */
  readonly starts?: readonly (ShareStatus | null)[];
  readonly users?: readonly ListedUser[];
}

// The server's relay is one mutable status: start and stop move it, and every poll reads it.
async function stubShare(page: Page, stub: ShareStub): Promise<TrpcRecorder> {
  await stubAuthConfig(page, stub.mode);
  let current = stub.initial;
  const starts = [...(stub.starts ?? [])];
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(stub.resolved ?? SEATING_ON),
    "settings.updateAppSettings": () => effectiveAppSettings(SEATING_ON),
    "sessions.me": () => stub.viewer ?? OWNER,
    "admin.listUsers": () => stub.users ?? [user("user_owner", "owner")],
    "admin.revokeUserSessions": () => ({ revoked: 1 }),
    "share.status": () => current,
    "share.stop": () => {
      current = OFF;
      return current;
    },
    "share.start": () => {
      const next = starts.shift();
      if (next === null || next === undefined) {
        return trpcError({ code: "BAD_REQUEST", reason: "share_in_container", message: "This server runs in a container, which carries no relay." });
      }
      current = next;
      return current;
    },
  });
}

function shareCard(page: Page): Locator {
  return page.getByRole("region", { name: "Share over the internet" });
}

function precondition(card: Locator, id: string): Locator {
  return card.locator(`[data-precondition="${id}"]`);
}

test("single-user: every row renders with its verdict and fix, and Start sharing is held", async ({ mount, page }) => {
  const trpc = await stubShare(page, { mode: "single-user", resolved: SEATING_OFF, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card).toHaveAttribute("data-share-state", "off");
  await expect(card.getByRole("listitem")).toHaveCount(4);
  await expect(precondition(card, "mode")).toHaveAttribute("data-verdict", "unmet");
  await expect(precondition(card, "owner")).toHaveAttribute("data-verdict", "waiting");
  await expect(precondition(card, "seating")).toHaveAttribute("data-verdict", "unmet");
  await expect(precondition(card, "relay")).toHaveAttribute("data-verdict", "unchecked");
  // The mode row's fix is the launcher command; the seating row's is the one confirmed write.
  await expect(precondition(card, "mode").getByRole("button", { name: copyActionName("the command pnpm start --share"), exact: true })).toBeVisible();
  await expect(precondition(card, "seating").getByRole("button", { name: "Turn both on" })).toBeEnabled();
  const start = card.getByRole("button", { name: "Start sharing" });
  await expect(start).toHaveAttribute("aria-disabled", "true");
  await expect(start).toHaveAttribute("aria-describedby", /.+/u);
  await expect.poll(() => trpc.unstubbed()).toEqual([]);
});

test("the seating fix turns on exactly the settings that are off, after one confirmation", async ({ mount, page }) => {
  const trpc = await stubShare(page, { mode: "local", resolved: { localMultiUser: true, discreetLogin: false }, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await precondition(card, "seating").getByRole("button", { name: "Turn both on" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn both on" }).click();
  await expect
    .poll(() => (trpc.lastInput("settings.updateAppSettings") as { partial?: unknown } | undefined)?.partial, { intervals: [20, 50, 100] })
    .toStrictEqual({ discreetLogin: true });
});

test("local with every row ready: Start sharing brings the link and its copy button, and no change notice", async ({ mount, page }) => {
  const trpc = await stubShare(page, { mode: "local", initial: OFF, starts: [UP_FIRST] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(precondition(card, "mode")).toHaveAttribute("data-verdict", "met");
  await expect(precondition(card, "owner")).toHaveAttribute("data-verdict", "met");
  await expect(precondition(card, "seating")).toHaveAttribute("data-verdict", "met");
  await card.getByRole("button", { name: "Start sharing" }).click();

  await expect(card).toHaveAttribute("data-share-state", "up");
  await expect(card.locator(`[data-share-url="${FIRST_URL}"]`)).toBeVisible();
  await expect(card.getByRole("button", { name: copyActionName(`the share link ${FIRST_URL}`), exact: true })).toBeVisible();
  await expect(card.locator("[data-share-relay]")).toHaveAttribute("data-share-relay", "quick");
  await expect(card.locator("[data-live-sockets]")).toHaveAttribute("data-live-sockets", "3");
  await expect(card.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Invite someone to a room" })).toBeVisible();
  await expect(card.getByRole("list", { name: "Before you share" })).toHaveCount(0);
  await expect(card.locator("[data-share-notice]")).toHaveCount(0);
  await expect.poll(() => trpc.count("share.start")).toBe(1);
});

test("a second up under a new URL raises the link-changed notice with the new link to copy", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: UP_FIRST, starts: [UP_SECOND] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card.locator(`[data-share-url="${FIRST_URL}"]`)).toBeVisible();
  await expect(card.locator("[data-share-notice]")).toHaveCount(0);

  await card.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
  await expect(card).toHaveAttribute("data-share-state", "off");
  await card.getByRole("button", { name: "Start sharing" }).click();

  await expect(card).toHaveAttribute("data-share-state", "up");
  const notice = card.locator('[data-share-notice="link-changed"]');
  await expect(notice).toHaveRole("alert");
  await expect(notice.getByRole("button", { name: copyActionName(`the new share link ${SECOND_URL}`), exact: true })).toBeVisible();
  await expect(card.locator(`[data-share-url="${SECOND_URL}"]`)).toBeVisible();

  await notice.getByRole("button", { name: "Dismiss the link notice" }).click();
  await expect(card.locator("[data-share-notice]")).toHaveCount(0);
});

test("a refused start marks the row it belongs to, and Start sharing stays available to check again", async ({ mount, page }) => {
  const trpc = await stubShare(page, { mode: "local", initial: OFF, starts: [null] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await card.getByRole("button", { name: "Start sharing" }).click();
  await expect(precondition(card, "relay")).toHaveAttribute("data-verdict", "refused");
  await expect(card).toHaveAttribute("data-share-state", "off");
  await expect(card.getByRole("button", { name: "Start sharing" })).not.toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => trpc.count("share.start")).toBe(1);
});

test("starting and down render the running panel with no link", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: { relay: { state: "down", relay: "quick", reason: "exited", restarting: true }, liveSocketCount: 0 } });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card).toHaveAttribute("data-share-state", "down");
  await expect(card.locator("[data-share-url]")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await expect(card.getByRole("list", { name: "Before you share" })).toHaveCount(0);
});

test("sign everyone out revokes every account but the owner's", async ({ mount, page }) => {
  const trpc = await stubShare(page, {
    mode: "local",
    initial: UP_FIRST,
    users: [user("user_owner", "owner"), user("user_friend", "user"), user("user_helper", "admin")],
  });
  await mount(<GovernanceSectionsStory />);

  await shareCard(page).getByRole("button", { name: "Sign everyone out" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sign everyone out" }).click();
  await expect
    .poll(() => trpc.inputs("admin.revokeUserSessions"), { intervals: [20, 50, 100] })
    .toEqual(expect.arrayContaining([{ userId: "user_friend" }, { userId: "user_helper" }]));
  await expect.poll(() => trpc.inputs("admin.revokeUserSessions")).toHaveLength(2);
});

test("a delegated admin never sees the card", async ({ mount, page }) => {
  const trpc = await stubShare(page, { mode: "local", viewer: DELEGATED_ADMIN, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByTestId("admin-sharing-panel")).toBeVisible();
  await expect(shareCard(page)).toHaveCount(0);
  await expect.poll(() => trpc.count("share.status")).toBe(0);
});

test.describe("at the narrowest content width", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  // A real quick-tunnel host is four random words, long enough to overflow a phone-width row unless it wraps.
  const LongUrl = "https://recommendations-bedroom-shareholders-adjustments.trycloudflare.com";

  test("the running card, its long link and its actions stay inside the card's own width", async ({ mount, page }) => {
    await stubShare(page, { mode: "local", initial: { relay: { state: "up", relay: "quick", url: LongUrl }, liveSocketCount: 1 } });
    await mount(<GovernanceSectionsStory width={360} />);

    const card = shareCard(page);
    await expect(card.locator(`[data-share-url="${LongUrl}"]`)).toBeVisible();
    await expect
      .poll(() =>
        card.evaluate((node) => {
          const edge = node.getBoundingClientRect().right;
          return Array.from(node.querySelectorAll("*")).filter((child) => child.getBoundingClientRect().right > edge + 0.5).length;
        }),
      )
      .toBe(0);
  });
});
