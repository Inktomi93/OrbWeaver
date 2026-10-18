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
import type { ChatId, Handle } from "@orb/kit/ids";
import { navResultShape } from "@orb/tooling/floor/browser/page-validate";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { SESSION_COOKIE } from "./actors.ts";

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

/** Open a chat by id through `window.__orb.nav.openChat`, the same nav-bridge call `snap --open-chat <id>`
 *  makes, after app-readiness and the bridge. Throws on a refusal or a missing bridge (a non-dev build),
 *  because a silently un-navigated page is a screenshot of the wrong surface. Module-local: the only caller
 *  is {@link openMembersTab}, and knip reds an export with no importer.
 *
 *  The handle stays unknown in page and is narrowed there; each callback is serialized alone, so each repeats
 *  the read. A renamed bridge method surfaces as the missing-bridge refusal. The raw verdict is validated on
 *  the Node side by {@link navResultShape}, the reader the browser instruments share. */
async function openChat(page: Page, chatId: ChatId): Promise<void> {
  await page.locator(APP_READY).waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const scope: object = globalThis;
      const bridge: unknown = "__orb" in scope ? scope.__orb : undefined;
      return typeof bridge === "object" && bridge !== null && "nav" in bridge && bridge.nav !== undefined;
    },
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  const verdict: unknown = await page.evaluate(async (id) => {
    const scope: object = globalThis;
    const bridge: unknown = "__orb" in scope ? scope.__orb : undefined;
    const navHandle: unknown = typeof bridge === "object" && bridge !== null && "nav" in bridge ? bridge.nav : undefined;
    if (typeof navHandle !== "object" || navHandle === null || !("openChat" in navHandle) || typeof navHandle.openChat !== "function") {
      return;
    }
    const result: unknown = await navHandle.openChat(id);
    return result;
  }, chatId);
  if (verdict === undefined) {
    throw new Error("__orb.nav.openChat is unavailable (not a dev build, or the method was renamed)");
  }
  const result = navResultShape(verdict, `nav openChat ${chatId}`);
  if (!result.ok) {
    throw new Error(`__orb.nav.openChat(${chatId}) refused: ${result.reason ?? "no reason given"}`);
  }
}

/** Open a chat AND its MEMBERS context tab through the REAL user affordance: the chat header's roster entry
 *  (accessible name `Members — <n>`). Deliberately NOT `__orb.nav.contextTab("members")` — that sets the tab
 *  request but does NOT dock the context panel, so the panel mounts at zero size and a screenshot of it is a
 *  1.9KB sliver of nothing (measured). The header entry does both (`setContextTab` +
 *  `setPanelMode("context", "docked")`, chat-header.tsx), which is why it is the one doorway a human has. */
export async function openMembersTab(page: Page, chatId: ChatId): Promise<void> {
  await openChat(page, chatId);
  await page.locator(MEMBERS_ENTRY).first().click({ timeout: READY_TIMEOUT_MS });
}
