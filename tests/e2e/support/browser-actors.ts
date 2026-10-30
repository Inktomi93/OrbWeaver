// BROWSER actors — the RENDERED twin of `actors.ts`. `actors.ts` drives the wire as a principal; this
// drives the APP as one, in an ISOLATED browser context per human, so a spec can screenshot the SAME room
// as the host and as a member in one run and compare what each actually SEES.
//
// WHY IT EXISTS: `snap --contexts N` is the ordinary tool for two-human pixels, but it targets the
// multi-user FIXTURE stack, which is a MANUALLY-RAISED sidecar — `pnpm fixture up`, never something a
// screenshot tool boots (tooling/src/snap/ops/fixture.ts only DETECTS it). So `--contexts` yields nothing
// in an unattended run. (Its ports stopped colliding with the dev pair in 2026-08-03 and both pairs are
// registry rows now — `tooling/src/floor/host/ports.ts` `DEV_PORTS`/`FIXTURE_PORTS`, #1271 — so the old
// "it reuses the dev ports" reason recorded here was stale.) The `local` Playwright project already boots a
// genuinely isolated multi-human stack (own ports, own DB, `E2E_HARNESS=on`, seeded owner+member), so the
// two-human PIXELS belong here, next to the two-human wire drives.
//
// THE AUTH DOOR IS THE REAL ONE: `POST /api/auth/login` (the same form the login screen submits) against
// the CONTEXT's own request jar, so the session cookie lands in that context's cookies exactly as a human's
// login would — never a storage-state injection, never a bypass. The project's origin is plain http with no
// proxy, so the server mints the http transport's cookie (`infra/auth/transport.ts`).
//
// Kept in the e2e-support tree, import-free of the app/package trees (the `trpc.ts`/`actors.ts` posture).

import type { ViewerView } from "@orb/contracts/identity";
import { CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { z } from "zod";
import { SESSION_COOKIE } from "./actors.ts";
import { openChatByTitle } from "./chat-room.ts";

/** One human's authenticated identity, isolated cookie jar and page. */
export interface BrowserActor {
  readonly handle: Handle;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly viewer: ViewerView;
  readonly close: () => Promise<void>;
}

export interface BrowserActorCredentials {
  readonly handle: Handle;
  readonly password: string;
  readonly expectedUserId?: UserId;
}

const APP_READY = "html[data-app-ready]";
const COOKIE_ACTOR_HEADERS = { [CSRF_HEADER]: "1", forwarded: "for=192.0.2.1" } as const;
// The login route requires the CSRF header (blocks login-CSRF), so this actor sends it exactly as the real client does.
const READY_TIMEOUT_MS = 30_000;
/** The chat header's roster entry, by its ACCESSIBLE NAME prefix (`Members — <count>`) — the count varies
 *  with the room, so the prefix is the stable half. */
const MEMBERS_ENTRY = '[aria-label^="Members "]';

/** Open an ISOLATED browser context logged in as a seeded LOCAL user and land it on the app root.
 *  `baseUrl` is the project's vite origin (Playwright's `baseURL` fixture). Throws — loudly, with the HTTP
 *  status — if the login mints no session, so a spec never screenshots an anonymous page believing it is a
 *  member's view. */
export async function openBrowserActor(browser: Browser, baseUrl: string, handle: Handle, password: string): Promise<BrowserActor> {
  const actor = await authenticateBrowserActor(browser, baseUrl, { handle, password });
  try {
    await actor.page.goto(baseUrl);
    await actor.page.locator(APP_READY).waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
    return actor;
  } catch (error) {
    await actor.close();
    throw error;
  }
}

/** Authenticate in an isolated native cookie jar and return before the page's first navigation. */
export async function authenticateBrowserActor(
  browser: Browser,
  baseUrl: string,
  account: BrowserActorCredentials,
  contextOptions: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserActor> {
  const context = await browser.newContext({ ...contextOptions, baseURL: baseUrl });
  try {
    const viewer = await authenticateBrowserContext(context, baseUrl, account);
    const page = await context.newPage();
    return { handle: account.handle, viewer, context, page, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Admit a native runner's own context before its page navigates or instrumentation attaches. */
export async function authenticateBrowserContext(context: BrowserContext, baseUrl: string, account: BrowserActorCredentials): Promise<ViewerView> {
  const { handle, password } = account;
  const res = await context.request.post(`${baseUrl}/api/auth/login`, { form: { handle, password }, headers: { [CSRF_HEADER]: "1" } });
  if (!res.ok()) {
    throw new Error(`Browser actor login failed (HTTP ${res.status()})`);
  }
  // A relay tell disables ambient owner fallback, so this read proves the cookie admitted the requested human.
  const response = await context.request.get(`${baseUrl}/api/trpc/sessions.me`, { headers: await browserActorRequestHeaders(context, baseUrl) });
  const result = z.object({ result: z.object({ data: viewerViewSchema }) }).safeParse(await response.json());
  if (!(response.ok() && result.success) || result.data.result.data.handle !== handle) {
    throw new Error("Browser actor cookie did not admit the requested account");
  }
  const viewer = result.data.result.data;
  if (account.expectedUserId !== undefined && viewer.userId !== account.expectedUserId) {
    throw new Error("Browser actor cookie did not admit the requested identity");
  }
  return viewer;
}

/** Bind wire calls to the same native cookie jar as the rendered actor, with ambient fallback disabled. */
export async function browserActorRequestHeaders(context: BrowserContext, baseUrl: string): Promise<Readonly<Record<string, string>>> {
  const cookies = await context.cookies(baseUrl);
  if (!cookies.some((cookie) => cookie.name === SESSION_COOKIE && cookie.value !== "")) {
    throw new Error("Browser actor login returned no retained session cookie");
  }
  return { ...COOKIE_ACTOR_HEADERS, cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") };
}

/** Open the chat whose list row carries `title` (the real Chats-list affordance), then its MEMBERS context
 *  tab through the chat header's roster entry (accessible name `Members — <n>`). The entry both selects the
 *  tab and docks the context panel (`setContextTab` + `setPanelMode("context", "docked")`, chat-header.tsx),
 *  which an undocked panel would not: it mounts at zero size. `title` must be unique on the shared DB. */
export async function openMembersTab(page: Page, title: string): Promise<void> {
  await openChatByTitle(page, title);
  await page.locator(MEMBERS_ENTRY).first().click({ timeout: READY_TIMEOUT_MS });
}
