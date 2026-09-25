// CT: the owner's Share card, mounted inside the real Multi-user section. It proves the precondition rows and their
// fixes, the link and its copy button on `up`, the "link changed" notice, where focus lands after each action that
// unmounts its own control, the refusal announcement, and that nothing above the card moves as the relay changes.
// Assertions ride roles, focus, geometry and the card's data attributes; no copy is asserted.

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
const STARTING: ShareStatus = { relay: { state: "starting", relay: "quick", restartAfter: null }, liveSocketCount: 0 };
const UP_FIRST: ShareStatus = { relay: { state: "up", relay: "quick", url: FIRST_URL }, liveSocketCount: 3 };
const UP_SECOND: ShareStatus = { relay: { state: "up", relay: "quick", url: SECOND_URL }, liveSocketCount: 1 };
const DOWN_RESTARTING: ShareStatus = { relay: { state: "down", relay: "quick", reason: "exited", restarting: true }, liveSocketCount: 0 };
const RESTART_STARTING: ShareStatus = { relay: { state: "starting", relay: "quick", restartAfter: "exited" }, liveSocketCount: 0 };
const GAVE_UP: ShareStatus = { relay: { state: "down", relay: "quick", reason: "launch_failed", restarting: false }, liveSocketCount: 0 };

const SEATING_ON: Partial<EffectiveAppSettings> = { localMultiUser: true, discreetLogin: true };
const SEATING_OFF: Partial<EffectiveAppSettings> = { localMultiUser: false, discreetLogin: false };

const ROOM_ID = "chat_share_invite_room";

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

interface ShareServer {
  readonly trpc: TrpcRecorder;
  /** Moves the relay, as the controller does between polls. */
  readonly set: (next: ShareStatus) => void;
}

// The server's relay is one mutable status: start and stop move it, the test moves it between polls, and every poll
// reads it. The settings write lands in the settings read, as the real server's does.
async function stubShare(page: Page, stub: ShareStub): Promise<ShareServer> {
  await stubAuthConfig(page, stub.mode);
  let current = stub.initial;
  let resolved = stub.resolved ?? SEATING_ON;
  const starts = [...(stub.starts ?? [])];
  const trpc = await routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(resolved),
    "settings.updateAppSettings": (input: unknown) => {
      resolved = { ...resolved, ...(input as { partial: Partial<EffectiveAppSettings> }).partial };
      return effectiveAppSettings(resolved);
    },
    "sessions.me": () => stub.viewer ?? OWNER,
    "admin.listUsers": () => stub.users ?? [user("user_owner", "owner")],
    "admin.revokeUserSessions": () => ({ revoked: 1 }),
    "chat.listChats": () => ({ items: [{ id: ROOM_ID, title: "Tavern night", participantNames: [] }], nextCursor: null, totalCount: 1 }),
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
  return {
    trpc,
    set: (next): void => {
      current = next;
    },
  };
}

function shareCard(page: Page): Locator {
  return page.getByRole("region", { name: "Share over the internet" });
}

function precondition(card: Locator, id: string): Locator {
  return card.locator(`[data-precondition="${id}"]`);
}

function linkCopy(card: Locator, url: string): Locator {
  return card.getByRole("button", { name: copyActionName(`the share link ${url}`), exact: true });
}

test("single-user: every row renders with its verdict and fix, and Start sharing is held", async ({ mount, page }) => {
  const { trpc } = await stubShare(page, { mode: "single-user", resolved: SEATING_OFF, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card.getByRole("heading", { level: 4 })).toHaveCount(1);
  await expect(card.locator("[data-share-state]")).toHaveAttribute("data-share-state", "off");
  await expect(card.getByRole("listitem")).toHaveCount(4);
  await expect(precondition(card, "mode")).toHaveAttribute("data-verdict", "unmet");
  await expect(precondition(card, "owner")).toHaveAttribute("data-verdict", "waiting");
  await expect(precondition(card, "seating")).toHaveAttribute("data-verdict", "unmet");
  await expect(precondition(card, "relay")).toHaveAttribute("data-verdict", "unchecked");
  // The mode row's fixes are the launcher command and the container's environment lines.
  await expect(precondition(card, "mode").getByRole("button", { name: copyActionName("the command pnpm start --share"), exact: true })).toBeVisible();
  await expect(precondition(card, "mode").getByRole("button", { name: copyActionName("the docker-compose environment lines"), exact: true })).toBeVisible();
  await expect(precondition(card, "seating").getByRole("button", { name: "Turn both on" })).toBeEnabled();
  const start = card.getByRole("button", { name: "Start sharing" });
  await expect(start).toHaveAttribute("aria-disabled", "true");
  await expect(start).toHaveAttribute("aria-describedby", /.+/u);
  await expect.poll(() => trpc.unstubbed()).toEqual([]);
});

test("the seating fix names the one setting that is off, writes only it, and hands focus to Start sharing", async ({ mount, page }) => {
  const { trpc } = await stubShare(page, { mode: "local", resolved: { localMultiUser: true, discreetLogin: false }, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(precondition(card, "seating").getByRole("button", { name: "Turn both on" })).toHaveCount(0);
  await precondition(card, "seating").getByRole("button", { name: "Turn on Discreet login" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn on Discreet login" }).click();
  await expect
    .poll(() => (trpc.lastInput("settings.updateAppSettings") as { partial?: unknown } | undefined)?.partial, { intervals: [20, 50, 100] })
    .toStrictEqual({ discreetLogin: true });
  await expect(precondition(card, "seating")).toHaveAttribute("data-verdict", "met");
  await expect(card.getByRole("button", { name: "Start sharing" })).toBeFocused();
});

test("Start sharing lands focus on the link's Copy button once the relay reports its link", async ({ mount, page }) => {
  const server = await stubShare(page, { mode: "local", initial: OFF, starts: [STARTING] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(precondition(card, "mode")).toHaveAttribute("data-verdict", "met");
  await expect(precondition(card, "owner")).toHaveAttribute("data-verdict", "met");
  await expect(precondition(card, "seating")).toHaveAttribute("data-verdict", "met");
  await card.getByRole("button", { name: "Start sharing" }).click();
  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "starting");
  server.set(UP_FIRST);

  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "up");
  await expect(linkCopy(card, FIRST_URL)).toBeFocused();
  await expect(card.locator(`[data-share-url="${FIRST_URL}"]`)).toBeVisible();
  await expect(card.locator('[data-share-warning="public-link"]')).toBeVisible();
  await expect(card.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Invite someone to a room" })).toBeVisible();
  await expect(card.getByRole("list", { name: "Before you share" })).toHaveCount(0);
  await expect(card.locator("[data-share-notice]")).toHaveCount(0);
  await expect.poll(() => server.trpc.count("share.start")).toBe(1);
});

test("a stop hands focus to Start sharing; a new link shows once, under a notice whose headline alone is the alert", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: UP_FIRST, starts: [UP_SECOND] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card.locator(`[data-share-url="${FIRST_URL}"]`)).toBeVisible();
  await card.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
  await expect(card.locator("[data-share-state]")).toHaveAttribute("data-share-state", "off");
  const start = card.getByRole("button", { name: "Start sharing" });
  await expect(start).toBeFocused();
  await start.click();

  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "up");
  const notice = card.locator('[data-share-notice="link-changed"]');
  await expect(notice.getByRole("alert")).toHaveCount(1);
  await expect(notice).not.toHaveAttribute("role", "alert");
  // One URL on the card: the notice points at the link, it never carries a second copy of it.
  await expect(card.locator("[data-share-url]")).toHaveCount(1);
  await expect(card.locator(`[data-share-url="${SECOND_URL}"]`)).toBeVisible();
  await expect(notice.getByRole("button")).toHaveCount(1);

  await notice.getByRole("button", { name: "Dismiss the link notice" }).click();
  await expect(card.locator("[data-share-notice]")).toHaveCount(0);
  await expect(linkCopy(card, SECOND_URL)).toBeFocused();
});

test("a refused start is announced on the row it belongs to, and Start sharing stays available to check again", async ({ mount, page }) => {
  const { trpc } = await stubShare(page, { mode: "local", initial: OFF, starts: [null] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await card.getByRole("button", { name: "Start sharing" }).click();
  await expect(precondition(card, "relay")).toHaveAttribute("data-verdict", "refused");
  await expect(precondition(card, "relay").getByRole("alert")).toBeVisible();
  await expect(card.getByRole("alert")).toHaveCount(1);
  await expect(card.locator("[data-share-state]")).toHaveAttribute("data-share-state", "off");
  await expect(card.getByRole("button", { name: "Start sharing" })).not.toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => trpc.count("share.start")).toBe(1);
});

test("a relay restarting after a death reads Down until its new link, with Stop and no link", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: RESTART_STARTING });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "restarting");
  await expect(card.locator("[data-share-url]")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(card.getByRole("list", { name: "Before you share" })).toHaveCount(0);
});

test("a relay that gave up offers Try again, never Start beside Stop, and Try again brings a link", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: GAVE_UP, starts: [UP_FIRST] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "stopped");
  await expect(card.getByRole("button", { name: "Start sharing" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(card.locator("[data-share-phase]")).toHaveAttribute("data-share-phase", "up");
  await expect(linkCopy(card, FIRST_URL)).toBeFocused();
});

test("nothing above the card moves while the relay goes off, starting, up, restarting and stopped", async ({ mount, page }) => {
  const server = await stubShare(page, { mode: "local", initial: OFF, starts: [STARTING] });
  await mount(<GovernanceSectionsStory />);

  const card = shareCard(page);
  // The relay state, not the card's display phase: this reads the same on every version of the card.
  const state = page.locator("[data-share-state]");
  const anchors = [
    page.getByRole("switch", { name: "Allow multiple humans (local mode)" }),
    page.getByRole("switch", { name: "Discreet login" }),
    page.getByRole("textbox", { name: "Allowed private endpoints" }),
  ];
  const tops = (): Promise<number[]> => Promise.all(anchors.map(async (anchor) => (await anchor.boundingBox())?.y ?? Number.NaN));

  await expect(state).toHaveAttribute("data-share-state", "off");
  const atRest = await tops();
  expect(atRest.every(Number.isFinite)).toBe(true);

  await card.getByRole("button", { name: "Start sharing" }).click();
  await expect(state).toHaveAttribute("data-share-state", "starting");
  expect(await tops()).toEqual(atRest);

  // Each move waits out the current state's poll: up polls every 5 s.
  for (const [next, expected] of [
    [UP_FIRST, "up"],
    [DOWN_RESTARTING, "down"],
    [RESTART_STARTING, "starting"],
  ] as const) {
    server.set(next);
    await expect(state).toHaveAttribute("data-share-state", expected, { timeout: 10_000 });
    expect(await tops()).toEqual(atRest);
  }
});

test("Invite someone to a room opens the picked room from the room menu", async ({ mount, page }) => {
  await stubShare(page, { mode: "local", initial: UP_FIRST });
  await mount(<GovernanceSectionsStory />);

  await shareCard(page).getByRole("button", { name: "Invite someone to a room" }).click();
  await page.getByRole("menuitem", { name: "Tavern night" }).click();
  // `openRoomInvite` makes the picked room the active one, which the active-chat store persists.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((name) => name.endsWith("active-chat"));
        return key === undefined
          ? null
          : (JSON.parse(localStorage.getItem(key) ?? "null") as { state?: { handle?: { id?: string } } } | null)?.state?.handle?.id;
      }),
    )
    .toBe(ROOM_ID);
});

test("sign everyone out revokes every account but the owner's", async ({ mount, page }) => {
  const { trpc } = await stubShare(page, {
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
  const { trpc } = await stubShare(page, { mode: "local", viewer: DELEGATED_ADMIN, initial: OFF });
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByTestId("admin-sharing-panel")).toBeVisible();
  await expect(shareCard(page)).toHaveCount(0);
  await expect.poll(() => trpc.count("share.status")).toBe(0);
});

test.describe("at the narrowest content width", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  // A real quick-tunnel host is four random words, long enough to overflow a phone-width row unless it wraps.
  const LongUrl = "https://recommendations-bedroom-shareholders-adjustments.trycloudflare.com";

  test("the running card stays inside its own width, and its link wraps only after a dot, slash or hyphen", async ({ mount, page }) => {
    await stubShare(page, { mode: "local", initial: { relay: { state: "up", relay: "quick", url: LongUrl }, liveSocketCount: 1 } });
    await mount(<GovernanceSectionsStory width={360} />);

    const card = shareCard(page);
    const link = card.locator(`[data-share-url="${LongUrl}"]`);
    await expect(link).toBeVisible();
    await expect
      .poll(() =>
        card.evaluate((node) => {
          const edge = node.getBoundingClientRect().right;
          return Array.from(node.querySelectorAll("*")).filter((child) => child.getBoundingClientRect().right > edge + 0.5).length;
        }),
      )
      .toBe(0);
    // The character before each line start: the link wraps (a phone cannot fit it) and every wrap follows a break
    // character, so no word is ever split.
    const breaksBeforeLines = (): Promise<string[]> =>
      link.evaluate((node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const chars: { readonly char: string; readonly top: number }[] = [];
        for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
          const value = text.textContent ?? "";
          for (let at = 0; at < value.length; at += 1) {
            const range = document.createRange();
            range.setStart(text, at);
            range.setEnd(text, at + 1);
            chars.push({ char: value.charAt(at), top: range.getBoundingClientRect().top });
          }
        }
        return chars.flatMap((entry, index) => {
          const before = chars[index - 1];
          return before !== undefined && entry.top > before.top + 1 ? [before.char] : [];
        });
      });
    await expect
      .poll(async () => {
        const breaks = await breaksBeforeLines();
        return { wraps: breaks.length > 0, midWord: breaks.filter((char) => ![".", "/", "-"].includes(char)) };
      })
      .toEqual({ wraps: true, midWord: [] });
  });
});
