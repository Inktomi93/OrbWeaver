// The router's auth guard on the local corpus: a signed-out alias or invite survives the redirect to sign-in, overlapping
// navigations settle on the latest one, and a signed-in invite handoff scrubs only its own query fields.
import { randomBytes } from "node:crypto";
import { SIGNUP_MAX_TTL_MS } from "@orb/contracts/chat";
import { viewerViewSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { devices } from "@playwright/test";
import { JOIN_CREATE_ACCOUNT_NAME, SIGN_IN_NAME } from "#client/features/auth/lib/pending-join-names.ts";
import { JOIN_CHAT_NAME } from "#client/features/chat/lib/members-names.ts";
import { CORPUS_MODE_LABELS } from "#client/lib/corpus-modes.ts";
import { PRIMARY_NAV_NAME } from "#client/lib/rail-names.ts";
import { testId } from "#client/lib/test-ids.ts";
import { ROUTE_PENDING_NAME } from "#client/routes/route-pending-names.ts";
import type { ActorClient } from "./support/actors.ts";
import { loginLocal } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";
import { serverNow } from "./support/server-clock.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const AUTH_ME = "**/api/auth/me";
// Long enough that a second guard read, if anything starts one, is still out when the first redirect lands.
const GUARD_READ_BUDGET_MS = 1200;
const APP_FAILURE = "[data-app-failure]";
const PASSWORD_BYTES = 16;

function capturedOwner(): { readonly handle: Handle; readonly password: string } {
  const owner = SELECTED_LOCAL_CORPUS_FIXTURE?.wire.reads["sessions.me"][0]?.output;
  const password = CORPUS_LOCAL_PASSWORDS.owner;
  if (owner === undefined || password === undefined) {
    throw new Error("Signed-out corpus smoke requires its captured owner and run-owned password");
  }
  return { handle: viewerViewSchema.parse(owner).handle, password };
}

/** A browser that is the signed-out visitor it stands for, on this cell's own device. */
async function signedOutContext(browser: Browser, baseURL: string, info: TestInfo): Promise<BrowserContext> {
  const project = BROWSER_PROJECTS.find(({ name }) => name === info.project.name);
  if (project === undefined) {
    throw new Error("Signed-out smoke has no native device project");
  }
  // A loopback request with no relay tell resolves as the box owner even without a cookie; an empty `forwarded`
  // header is the tell that makes this browser the signed-out visitor it stands for.
  return await browser.newContext({ ...devices[project.device], baseURL, locale: "en-US", timezoneId: "UTC", extraHTTPHeaders: { forwarded: "" } });
}

/** Holds each guard read short of the real server until the case releases it: `releaseNext` lets the oldest held read
 *  through, `releaseAll` lets every held and later read through. */
async function holdAuthMe(page: Page): Promise<{ readonly reads: () => number; readonly releaseNext: () => void; readonly releaseAll: () => void }> {
  const held: PromiseWithResolvers<void>[] = [];
  let released = 0;
  let open = false;
  await page.route(AUTH_ME, async (route) => {
    const hold = Promise.withResolvers<void>();
    held.push(hold);
    if (open) {
      hold.resolve();
    }
    await hold.promise;
    await route.continue();
  });
  return {
    reads: (): number => held.length,
    releaseNext: (): void => {
      held[released]?.resolve();
      released += 1;
    },
    releaseAll: (): void => {
      open = true;
      for (const hold of held) {
        hold.resolve();
      }
    },
  };
}

/** A real signup invite to a fresh room the owner hosts; the room is deleted after `run`. */
async function withSignupInvite(baseURL: string, run: (token: string) => Promise<void>): Promise<void> {
  const { handle, password } = capturedOwner();
  const host: ActorClient = await loginLocal(baseURL, handle, password);
  const characterId = SELECTED_LOCAL_CORPUS_FIXTURE?.wire.libraryRelations?.ids.characterId;
  if (characterId === undefined) {
    throw new Error("Local corpus has no library character");
  }
  const started = await host.trpc.chat.startChat.mutate({ characterIds: [characterId] });
  try {
    // A signup link: a signed-out visitor may create an account through it, inside the server's signup bounds.
    const invite = await host.trpc.invites.createInvite.mutate({
      chatId: started.chat.id,
      input: { allowSignup: true, maxUses: 1, expiresAt: (await serverNow(baseURL)) + SIGNUP_MAX_TTL_MS / 2 },
    });
    await run(invite.token);
  } finally {
    await host.trpc.chat.delete.mutate({ chatId: started.chat.id });
  }
}

/** A real invite to a room another account hosts, so the signed-in owner meets the ready preview a stranger's link
 *  shows; the room is deleted after `run`. */
async function withMemberInvite(baseURL: string, info: TestInfo, run: (token: string) => Promise<void>): Promise<void> {
  const { handle, password } = capturedOwner();
  const owner = await loginLocal(baseURL, handle, password);
  // The local stack's database is shared by every cell of a run, so each project mints its own host.
  const account = {
    handle: castId<Handle>(`rt3-host-${info.project.name.replace("corpus-local-", "")}`),
    password: randomBytes(PASSWORD_BYTES).toString("hex"),
  };
  await owner.trpc.admin.createUser.mutate(account);
  const host = await loginLocal(baseURL, account.handle, account.password);
  const character = await host.trpc.character.create.mutate({
    input: { handle: "handoff-host", name: "Handoff Host", description: "The room a stranger's link opens.", greetings: [{ text: "Welcome." }] },
  });
  const started = await host.trpc.chat.startChat.mutate({ characterIds: [character.id] });
  try {
    await run((await host.trpc.invites.createInvite.mutate({ chatId: started.chat.id, input: {} })).token);
  } finally {
    await host.trpc.chat.delete.mutate({ chatId: started.chat.id });
  }
}

function address(page: Page): Promise<{ readonly href: string; readonly length: number }> {
  return page.evaluate(() => ({ href: location.pathname + location.search + location.hash, length: history.length }));
}

test.describe("local corpus auth guard", () => {
  test.skip(SELECTED_LOCAL_CORPUS_FIXTURE === undefined, "Requires the committed local corpus");

  test("the /analytics alias heals to Corpus Insights before the auth redirect and survives sign-in", { tag: "@smoke" }, async ({ browser, baseURL }, info) => {
    const owner = capturedOwner();
    const context = await signedOutContext(browser, baseURL ?? "", info);
    try {
      const page = await context.newPage();
      await page.goto("/analytics");
      await expect(page).toHaveURL(/\/login$/u, { timeout: WAIT_SETTLE_MS });
      await expect(page.getByRole("heading", { name: SIGN_IN_NAME, exact: true })).toBeVisible();
      await page.getByRole("textbox", { name: "Handle", exact: true }).fill(owner.handle);
      await page.getByLabel("Password", { exact: true }).fill(owner.password);
      await page.getByRole("button", { name: SIGN_IN_NAME, exact: true }).click();
      await waitForAppReady(page);
      // The alias named a Corpus mode before the redirect; the signed-in app opens on it rather than on Home.
      await expect(page.getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).first()).toHaveAttribute("aria-checked", "true");
    } finally {
      await context.close();
    }
  });

  test(
    "a slow auth read on a signed-out invite landing reaches the invite form, not the crash fallback",
    { tag: "@smoke" },
    async ({ browser, baseURL }, info) => {
      await withSignupInvite(baseURL ?? "", async (token) => {
        const context = await signedOutContext(browser, baseURL ?? "", info);
        try {
          const page = await context.newPage();
          await page.goto("/login");
          await expect(page.getByRole("heading", { name: SIGN_IN_NAME, exact: true })).toBeVisible();
          const before = await address(page);
          const guard = await holdAuthMe(page);
          await page.goto(`/?join=${token}`, { waitUntil: "commit" });
          const join = page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true });
          const pending = page.getByRole("status", { name: ROUTE_PENDING_NAME, exact: true });
          // Two slow windows: the landing's own guard read, then the sign-in page's after the redirect. In each the router
          // paints its pending mark, the form stays out, and the crash fallback never shows.
          for (const read of [1, 2]) {
            await expect.poll(guard.reads).toBe(read);
            await expect(pending).toBeVisible();
            await expect(join).toBeHidden();
            await expect(page.locator(APP_FAILURE)).toHaveCount(0);
            guard.releaseNext();
          }

          await expect(join).toBeVisible({ timeout: GUARD_READ_BUDGET_MS * 4 });
          await expect(page.locator(APP_FAILURE)).toHaveCount(0);
          // The redirect replaces the landing's own entry, so the token leaves the address bar and Back alike.
          await expect.poll(() => address(page)).toEqual({ href: "/login", length: before.length + 1 });
          // One guard read for `/` and one for `/login`: a scrub the router hears as a navigation would re-run `/`.
          expect(guard.reads()).toBe(2);
        } finally {
          await context.close();
        }
      });
    },
  );

  test("overlapping navigations during a slow guard settle on the latest login location", { tag: "@smoke" }, async ({ browser, baseURL }, info) => {
    const context = await signedOutContext(browser, baseURL ?? "", info);
    try {
      const page = await context.newPage();
      await page.goto("/login?first=1");
      await expect(page.getByRole("heading", { name: SIGN_IN_NAME, exact: true })).toBeVisible();
      const guard = await holdAuthMe(page);
      // A second entry for Forward to return to; the router is not told, as with any entry it did not make.
      await page.evaluate(() => history.pushState(null, "", "/login?second=1"));
      // Back, and Forward the moment Back lands: the router has begun Back's navigation and its guard read is
      // still out, so two router navigations are in flight at once.
      await page.evaluate(() => {
        addEventListener(
          "popstate",
          () => {
            history.forward();
          },
          { once: true },
        );
        history.back();
      });
      await expect.poll(guard.reads).toBeGreaterThanOrEqual(2);
      guard.releaseAll();
      await expect(page.getByRole("heading", { name: SIGN_IN_NAME, exact: true })).toBeVisible({ timeout: GUARD_READ_BUDGET_MS * 8 });
      await expect(page.locator(APP_FAILURE)).toHaveCount(0);
      await expect.poll(async () => (await address(page)).href, { timeout: GUARD_READ_BUDGET_MS * 8 }).toBe("/login?second=1");
    } finally {
      await context.close();
    }
  });

  test("a signed-in invite handoff opens the join dialog once and scrubs only its own query fields", { tag: "@smoke" }, async ({ page, baseURL }, info) => {
    await withMemberInvite(baseURL ?? "", info, async (token) => {
      await page.goto("/");
      await waitForAppReady(page);
      const before = await address(page);
      // `%6aoin` is `join` once decoded, so it is the same field and leaves with the others. Only the FIRST `join`
      // is the real token: a handoff that took any other value would land on the dead-invite state, not this one.
      await page.goto(`/?space=%20&join=${token}&plus=+&join=second&tag=first&tag=second&%6aoin=third#turn-4`);
      const dialog = page.getByTestId(testId("joinInviteDialog"));
      await expect(dialog).toBeVisible({ timeout: WAIT_SETTLE_MS });
      await expect(dialog.getByRole("button", { name: JOIN_CHAT_NAME, exact: true })).toBeVisible();
      await expect.poll(() => address(page)).toEqual({ href: "/?space=%20&plus=+&tag=first&tag=second#turn-4", length: before.length + 1 });
      // A reload replays nothing: the token was spent when the dialog took it.
      await page.reload();
      await waitForAppReady(page);
      await expect(page.getByTestId(testId("joinInviteDialog"))).toHaveCount(0);
    });
  });

  test("a signed-in phone reaches Log out from the You sheet's account foot", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "The You sheet is the phone's account door");
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("navigation", { name: PRIMARY_NAV_NAME }).getByRole("button", { name: "You", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId(testId("accountSurface"))).toContainText(capturedOwner().handle);
    await expect(sheet.getByTestId(testId("accountLogout"))).toBeEnabled();
  });
});
