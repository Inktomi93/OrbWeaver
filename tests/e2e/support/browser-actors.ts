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

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { SESSION_COOKIE } from "./actors.ts";
import { openChatByTitle } from "./chat-room.ts";

/** One human's isolated browser session: their own cookie jar + one page, already on the app. */
export interface BrowserActor {
  readonly handle: Handle;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly close: () => Promise<void>;
}

const APP_READY = "html[data-app-ready]";
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
  const context = await browser.newContext({ baseURL: baseUrl });
  const res = await context.request.post(`${baseUrl}/api/auth/login`, { form: { handle, password }, headers: { [CSRF_HEADER]: "1" } });
  if (!res.ok()) {
    await context.close();
    throw new Error(`openBrowserActor(${handle}): login failed (HTTP ${res.status()})`);
  }
  const cookies = await context.cookies(baseUrl);
  if (!cookies.some((c) => c.name === SESSION_COOKIE && c.value !== "")) {
    await context.close();
    throw new Error(`openBrowserActor(${handle}): login returned no session cookie the browser kept`);
  }
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.locator(APP_READY).waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
  return { handle, context, page, close: () => context.close() };
}

/** Open the chat whose list row carries `title` (the real Chats-list affordance), then its MEMBERS context
 *  tab through the chat header's roster entry (accessible name `Members — <n>`). The entry both selects the
 *  tab and docks the context panel (`setContextTab` + `setPanelMode("context", "docked")`, chat-header.tsx),
 *  which an undocked panel would not: it mounts at zero size. `title` must be unique on the shared DB. */
export async function openMembersTab(page: Page, title: string): Promise<void> {
  await openChatByTitle(page, title);
  await page.locator(MEMBERS_ENTRY).first().click({ timeout: READY_TIMEOUT_MS });
}
