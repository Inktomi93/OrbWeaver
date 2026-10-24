// The router's auth guard on the local corpus: a signed-out alias or invite survives the redirect to sign-in, overlapping
// navigations settle on the latest one, and a signed-in invite handoff scrubs only its own query fields.
import { setTimeout as sleep } from "node:timers/promises";
import { CORPUS_MODE_LABELS, testId } from "@orb/client/lib";
import { SIGNUP_MAX_TTL_MS } from "@orb/contracts/chat";
import { viewerViewSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { devices } from "@playwright/test";
import type { ActorClient } from "./support/actors.ts";
import { loginLocal } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const AUTH_ME = "**/api/auth/me";
// Long enough that a second guard read, if anything starts one, is still out when the first redirect lands.
const SLOW_ME_MS = 1200;
const APP_FAILURE = "[data-app-failure]";

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

/** Every guard read waits before it reaches the real server; returns the running count of reads. */
async function slowAuthMe(page: Page): Promise<() => number> {
  let reads = 0;
  await page.route(AUTH_ME, async (route) => {
    reads += 1;
    await sleep(SLOW_ME_MS);
    await route.continue();
  });
  return (): number => reads;
}

/** A real invite to a fresh room the owner hosts, optionally one that may create an account; the room is deleted after `run`. */
async function withInvite(baseURL: string, signup: boolean, run: (token: string) => Promise<void>): Promise<void> {
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
      input: signup ? { allowSignup: true, maxUses: 1, expiresAt: Date.now() + SIGNUP_MAX_TTL_MS / 2 } : {},
    });
    await run(invite.token);
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
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await page.getByRole("textbox", { name: "Handle", exact: true }).fill(owner.handle);
      await page.getByLabel("Password", { exact: true }).fill(owner.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
      await withInvite(baseURL ?? "", true, async (token) => {
        const context = await signedOutContext(browser, baseURL ?? "", info);
        try {
          const page = await context.newPage();
          await page.goto("/login");
          await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
          const before = await address(page);
          const reads = await slowAuthMe(page);
          await page.goto(`/?join=${token}`);

          await expect(page.getByRole("button", { name: "Create account and join", exact: true })).toBeVisible({ timeout: SLOW_ME_MS * 4 });
          await expect(page.locator(APP_FAILURE)).toHaveCount(0);
          // The redirect replaces the landing's own entry, so the token leaves the address bar and Back alike.
          await expect.poll(() => address(page)).toEqual({ href: "/login", length: before.length + 1 });
          // One guard read for `/` and one for `/login`: a scrub the router hears as a navigation would re-run `/`.
          expect(reads()).toBe(2);
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
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      const reads = await slowAuthMe(page);
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
      await expect.poll(reads).toBeGreaterThanOrEqual(2);
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: SLOW_ME_MS * 8 });
      await expect(page.locator(APP_FAILURE)).toHaveCount(0);
      await expect.poll(async () => (await address(page)).href, { timeout: SLOW_ME_MS * 8 }).toBe("/login?second=1");
    } finally {
      await context.close();
    }
  });

  test("a signed-in invite handoff opens the join dialog once and scrubs only its own query fields", { tag: "@smoke" }, async ({ page, baseURL }) => {
    await withInvite(baseURL ?? "", false, async (token) => {
      await page.goto("/");
      await waitForAppReady(page);
      const before = await address(page);
      // `%6aoin` is `join` once decoded, so it is the same field and leaves with the others.
      await page.goto(`/?space=%20&join=${token}&plus=+&join=second&tag=first&tag=second&%6aoin=third#turn-4`);
      await expect(page.getByTestId(testId("joinInviteDialog"))).toBeVisible({ timeout: WAIT_SETTLE_MS });
      await expect.poll(() => address(page)).toEqual({ href: "/?space=%20&plus=+&tag=first&tag=second#turn-4", length: before.length + 1 });
      // A reload replays nothing: the token was spent when the dialog took it.
      await page.reload();
      await waitForAppReady(page);
      await expect(page.getByTestId(testId("joinInviteDialog"))).toHaveCount(0);
    });
  });
});
