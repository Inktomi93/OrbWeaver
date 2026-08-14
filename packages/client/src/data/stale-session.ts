// The STALE-SESSION RECOVERY LADDER (#23b, extended by staleness-and-session-freshness.md §4.4). A
// mid-session UNAUTHORIZED means the cookie the app booted with is no longer valid — revoked/expired, or
// (the reported case) the user row it pointed at was wiped and the browser is still holding a session for an
// owner that no longer exists. Route `beforeLoad` guards only run at NAVIGATION, so once the authed shell is
// mounted a session that goes stale would otherwise keep rendering the per-user-scoped EMPTY that looks
// exactly like "no data" ([[per-user-scoped-empty-is-about-the-asker]]) — silently, with no re-auth prompt.
//
// WHAT REPLACED THE BARE HARD REDIRECT, and why each rung exists:
//   • RUNG 0 — PROBE. `GET /api/auth/me` first, ALWAYS. Under `single-user`/`forward-header` the origin
//     fallback re-admits every request by design, so the 401 that triggered this was a blip or a race and a
//     reload would have been pure waste; another tab may also have already recovered. On `authenticated`
//     the tab RESUMES IN PLACE: invalidate identity + every user root, force the socket's rooms to
//     re-announce, and carry on with the cache intact. This rung converts the majority of yesterday's
//     state-destroying reloads into invisible recoveries.
//   • RUNG 1 — RE-AUTH IN PLACE (owner fork F2/F3). `local`: an auth-owned modal over the frozen shell —
//     the query cache is PRESERVED, so a successful sign-in as the same handle resumes exactly where the
//     user was. `oidc`: a full-page bounce to the IdP with a one-shot resume snapshot written first.
//   • RUNG 2 — SIGNED OUT. Today's behavior (hard redirect to /login), now BROADCAST so N tabs land once
//     instead of stampeding independently.
//
// SINGLE-FLIGHT IS CROSS-TAB (§4.3). The old latch was per-tab module state, so a 401 burst across four
// tabs was four recoveries. The ladder runs inside a Web Lock: one tab leads, the others take no action and
// settle on its broadcast verdict.
//
// THE HOST IS INJECTED because this module is `data/` and the modal is a FEATURE. `app-root` (the sanctioned
// composition route) binds it. An UNBOUND host is not a failure mode — it means the app shell is not
// mounted yet, and the ladder correctly degrades to rung 2.

import type { ChatId, Handle } from "@orb/kit/ids";
import { onSessionMessage, postSessionMessage, runSessionRecoverySingleFlight } from "#lib";
import { fetchAuthMe } from "./auth-bootstrap.ts";
import { fetchAuthConfig } from "./auth-config.ts";
import { markSessionFresh } from "./session-freshness.ts";
import { writeSessionResume } from "./session-resume.ts";

const LOGIN_PATH = "/login";
const OIDC_LOGIN_PATH = "/api/auth/oidc/login";

/** What the ladder needs from the mounted app shell. Bound by `routes/app-root.tsx`. */
export interface SessionRecoveryHost {
  /** Rung 0's payload: re-read identity + every user root and re-announce the socket's rooms, WITHOUT
   *  navigating. The query cache survives — that is the whole point of the rung. */
  readonly resumeInPlace: () => void;
  /** Open the local-mode re-auth modal. The modal reports back through {@link completeReauth}. */
  readonly openReauthPrompt: () => void;
  /** The one-shot OIDC resume target, read at bounce time so it is never a stale closure. */
  readonly resumeChatId: () => ChatId | null;
  /** The handle this tab's cache BELONGS to — the identity-boundary check for a rung-1 re-auth (§4.2.1). */
  readonly currentHandle: () => Handle | null;
}

let host: SessionRecoveryHost | null = null;
let unsubscribeSiblings: (() => void) | null = null;
/** One ladder ATTEMPT at a time in this tab, released on the verdict (a navigation never releases). */
let recovering = false;
/** A whole-document navigation has been ordered — the latch stays SET so a late error can't fire a second
 *  one (the loop guard the original belt got right, kept). */
let navigated = false;
/** The rung-1 modal's verdict, awaited by the ladder while it holds the recovery lock. */
let reauthSettle: ((outcome: ReauthOutcome) => void) | null = null;

/** How a rung-1 re-auth prompt ended. `dismissed` falls through to rung 2 — a user who closes the prompt
 *  has declined to re-authenticate, and leaving them on a frozen shell would be the dishonest arm. */
export type ReauthOutcome = "recovered" | "dismissed";

/** UNAUTHORIZED is the TRANSPORT verdict "no principal was minted" (session invalid/absent). Per-procedure
 *  authz refusals are FORBIDDEN or the leak-free NOT_FOUND, never this — so keying on it is precisely "the
 *  session is stale", not "this one call was denied".
 *
 *  The `?.` on the CAST is load-bearing: the QueryCache `onError` hands us whatever was thrown, and `unknown`
 *  includes `null`/`undefined`. A bare `.data` read on those throws a TypeError INSIDE the cache callback —
 *  taking down the always-on recovery belt on exactly the errors it exists to survive. */
function isUnauthorized(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null | undefined)?.data?.code === "UNAUTHORIZED";
}

function canNavigate(): boolean {
  return typeof globalThis.location !== "undefined" && globalThis.location.pathname !== LOGIN_PATH;
}

/** Order a whole-document navigation, exactly once. */
function navigateTo(path: string): void {
  if (!canNavigate()) {
    return;
  }
  navigated = true;
  globalThis.location.assign(path);
}

/** Rung 2 — the interactive-login reset, broadcast so sibling tabs land with it instead of stampeding. */
function signOut(): void {
  postSessionMessage({ kind: "signed-out" });
  navigateTo(LOGIN_PATH);
}

/** Rung 0's success arm, shared with a rung-1 local re-auth: nothing navigates, nothing is dropped. */
function resume(handle: Handle | null): void {
  markSessionFresh();
  host?.resumeInPlace();
  postSessionMessage({ kind: "session-recovered", handle });
}

/** Rung 1, `local`: hand off to the modal and hold the recovery lock until it reports back. */
function promptReauth(): Promise<ReauthOutcome> {
  if (host === null) {
    return Promise.resolve("dismissed");
  }
  const { promise, resolve } = Promise.withResolvers<ReauthOutcome>();
  reauthSettle = resolve;
  host.openReauthPrompt();
  return promise;
}

/** The re-auth modal's report. `recovered` means the SAME handle signed back in (a different handle is an
 *  identity boundary the modal resolves with a hard reload of its own, §4.2.1). */
export function completeReauth(outcome: ReauthOutcome): void {
  const settle = reauthSettle;
  reauthSettle = null;
  settle?.(outcome);
}

/** The ladder itself — rung 0, then the mode-forked rung 1, then rung 2. */
async function runLadder(): Promise<void> {
  postSessionMessage({ kind: "session-recovering" });
  const me = await fetchAuthMe().catch(() => null);
  if (me === null) {
    // The server is unreachable, not the session dead (the route guard draws the same line). Leave the tab
    // exactly as it is: the next real edge re-enters the ladder.
    return;
  }
  if (me.authenticated) {
    resume(me.handle);
    return;
  }
  const config = await fetchAuthConfig().catch(() => null);
  if (config?.mode === "oidc") {
    writeSessionResume({ chatId: host?.resumeChatId() ?? null });
    navigateTo(OIDC_LOGIN_PATH);
    return;
  }
  if (config?.mode === "local" && (await promptReauth()) === "recovered") {
    const reauthed = await fetchAuthMe().catch(() => null);
    if (reauthed?.authenticated === true) {
      // §4.2.1's identity boundary: a DIFFERENT handle just signed in on this browser, so every warm cache
      // entry and every durable-local blob belongs to somebody else. A full document load is the only
      // leak-free reset — the same reasoning the account modal's sign-out already runs on.
      if (reauthed.handle !== host?.currentHandle()) {
        navigateTo("/");
        return;
      }
      resume(reauthed.handle);
      return;
    }
  }
  signOut();
}

/** Enter the ladder. Single-flight in this tab AND across tabs; a follower does nothing and settles on the
 *  leader's broadcast. Fire-and-forget — every caller is a synchronous error/lifecycle edge. */
export function beginSessionRecovery(): void {
  if (recovering || navigated || !canNavigate()) {
    return;
  }
  recovering = true;
  // The latch releases on the VERDICT, not forever: a resumed tab must be able to re-enter the ladder the
  // next time its session dies. Only an ordered navigation keeps it set (see `navigated`).
  void runSessionRecoverySingleFlight(runLadder).finally(() => {
    recovering = false;
  });
}

/** The QueryCache/MutationCache belt (#23b) — every settled error passes through here. */
export function recoverIfStaleSession(error: unknown): void {
  if (isUnauthorized(error)) {
    beginSessionRecovery();
  }
}

/** The SUBSCRIPTION-path belt. The socket's faults arrive as a tRPC error code or as the typed terminal
 *  `__subscriptionError` frame's `code` — a bare string, with no error object to shape-match. Every other
 *  code keeps its toast-only handling; only UNAUTHORIZED is a session verdict. */
export function recoverIfUnauthorizedCode(code: string | undefined): boolean {
  if (code !== "UNAUTHORIZED") {
    return false;
  }
  beginSessionRecovery();
  return true;
}

/** Bind (or unbind) the mounted shell. Binding also subscribes this tab to sibling-tab verdicts, which is
 *  what makes a logout in one tab tear down the others. */
export function bindSessionRecovery(next: SessionRecoveryHost | null): void {
  host = next;
  unsubscribeSiblings?.();
  unsubscribeSiblings = null;
  if (next === null) {
    return;
  }
  unsubscribeSiblings = onSessionMessage((message) => {
    if (message.kind === "signed-out") {
      navigateTo(LOGIN_PATH); // a sibling signed out; this tab lands with it instead of rendering warm cache
      return;
    }
    if (message.kind === "session-recovered") {
      // A sibling re-authenticated on the SHARED cookie — this tab's reads are stale, not its session.
      markSessionFresh();
      next.resumeInPlace();
    }
  });
}
