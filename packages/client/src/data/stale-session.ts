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
//     AS THE SAME HANDLE the tab RESUMES IN PLACE: invalidate identity + every user root, force the
//     socket's rooms to re-announce, and carry on with the cache intact. This rung converts the majority of
//     yesterday's state-destroying reloads into invisible recoveries.
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
// EVERY RESUME CROSSES THE IDENTITY BOUNDARY FIRST (§4.2.1). `authenticated: true` answers "is there a live
// session", NEVER "is it ours" — the cookie is per-BROWSER, so a session that comes back can belong to a
// different human (a shared browser; a re-minted dev identity). Resuming there leaves the previous human's
// chats, characters and drafts rendered while every later read and write runs as the new one. So all FOUR
// resume paths — rung 0, a rung-1 re-auth, the freshness probe's verdict, and a sibling tab's broadcast —
// run the same compare through {@link identityBoundaryCrossed}, and a crossing takes the hard-reload arm.
// The compare FAILS CLOSED: an unbound host (the belt lives in `query-client.ts`, constructed before React
// mounts) can prove nothing, so it reloads rather than resuming a cache it cannot show is this identity's.
//
// THE HOST IS INJECTED because this module is `data/` and the modal is a FEATURE. `app-root` (the sanctioned
// composition route) binds it. An UNBOUND host is not a failure mode — it means the app shell is not
// mounted yet, and the ladder correctly degrades to rung 2.

import type { ChatId, Handle } from "@orb/kit/ids";
import { notify, onSessionMessage, postSessionMessage, runSessionRecoverySingleFlight, sessionDocument } from "#lib";
import { fetchAuthMe } from "./auth-bootstrap.ts";
import { fetchAuthConfig } from "./auth-config.ts";
import { markSessionFresh } from "./session-freshness.ts";
import { writeSessionResume } from "./session-resume.ts";

const LOGIN_PATH = "/login";
const OIDC_LOGIN_PATH = "/api/auth/oidc/login";
/** The identity-boundary reset target. A whole-document load of the app itself — the session is VALID, it
 *  is just somebody else's, so `/login` would bounce straight back. A module constant, like every other
 *  target here: no navigation in this file is ever built from a fetched or broadcast value. */
const APP_ROOT_PATH = "/";

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
  const pathname = sessionDocument.currentPathname();
  return pathname !== null && pathname !== LOGIN_PATH;
}

/** Order a whole-document navigation, exactly once. */
function navigateTo(path: string): void {
  if (!canNavigate()) {
    return;
  }
  navigated = true;
  sessionDocument.assign(path);
}

/** Rung 2 — the interactive-login reset, broadcast so sibling tabs land with it instead of stampeding. */
function signOut(): void {
  postSessionMessage({ kind: "signed-out" });
  navigateTo(LOGIN_PATH);
}

/** §4.2.1's IDENTITY BOUNDARY — is the session that just answered a DIFFERENT identity than the one this
 *  tab's warm cache and durable-local blobs belong to? Every resume path asks this before resuming.
 *
 *  FAIL CLOSED, by the `?.`: with no host bound there is nothing to compare against, so the comparison is
 *  against `undefined` and every handle crosses — the ambiguous case takes the hard-reload arm. A bound host
 *  that has not resolved its viewer yet reports `null`, which matches only the equally identity-less
 *  absent-principal answer (`/api/auth/me` serves `principal?.handle ?? null`, so a live principal always
 *  names one). */
function identityBoundaryCrossed(recoveredIdentity: string | null): boolean {
  return recoveredIdentity !== host?.currentHandle();
}

/** Rung 0's success arm, shared with a rung-1 local re-auth: nothing navigates, nothing is dropped. */
function resume(handle: Handle | null): void {
  markSessionFresh();
  host?.resumeInPlace();
  postSessionMessage({ kind: "session-recovered", handle });
}

/** The other side of the boundary: a session came back as SOMEBODY ELSE. Broadcast the new identity first
 *  — a sibling tab still holding the old one must reload itself too, and after this call this document is
 *  on its way out — then take the only leak-free reset there is, a whole-document load. */
function resetOntoNewIdentity(handle: Handle | null): void {
  postSessionMessage({ kind: "session-recovered", handle });
  navigateTo(APP_ROOT_PATH);
}

/** The freshness probe's verdict (§4.4.1), decided HERE because this is where the identity boundary lives.
 *  `true` means "still alive AND still ours" — the only state in which a warm tab may keep rendering.
 *
 *  This sensor exists for the case no other one can see: when a different identity signs in on this browser
 *  the cookie is VALID, so this tab never 401s and nothing ever enters the ladder. A REJECTION propagates
 *  untouched — `startSessionFreshness` reads a thrown probe as "server unreachable" and does nothing, which
 *  is not the same verdict as `false`. */
export async function probeSessionContinuity(): Promise<boolean> {
  const me = await fetchAuthMe();
  return me.authenticated && !identityBoundaryCrossed(me.handle);
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
  // @orb-waive caught-failure-ownership(fetchAuthMe): the server is unreachable, not the session dead (see the comment below) — the tab is left exactly as it is and the next real edge re-enters the ladder. Ends if unreachable must be distinguished from dead here.
  const me = await fetchAuthMe().catch(() => null);
  if (me === null) {
    // The server is unreachable, not the session dead (the route guard draws the same line). Leave the tab
    // exactly as it is: the next real edge re-enters the ladder.
    return;
  }
  if (me.authenticated) {
    // A live session is not automatically OUR session (see the header) — the same §4.2.1 boundary rung 1
    // has always enforced, at the rung that discovers the identity first.
    if (identityBoundaryCrossed(me.handle)) {
      resetOntoNewIdentity(me.handle);
      return;
    }
    resume(me.handle);
    return;
  }
  // @orb-waive caught-failure-ownership(fetchAuthConfig): a null config falls through every mode branch to the ladder's fail-closed `signOut()` floor at the end of the function. Ends if a branch after this stops reaching signOut().
  const config = await fetchAuthConfig().catch(() => null);
  if (config?.mode === "oidc") {
    writeSessionResume({ chatId: host?.resumeChatId() ?? null });
    navigateTo(OIDC_LOGIN_PATH);
    return;
  }
  if (config?.mode === "local" && (await promptReauth()) === "recovered") {
    // @orb-waive caught-failure-ownership(fetchAuthMe): a null/unauthenticated read falls through to the ladder's fail-closed `signOut()` floor at the end of the function. Ends if this branch stops reaching signOut().
    const reauthed = await fetchAuthMe().catch(() => null);
    if (reauthed?.authenticated === true) {
      // §4.2.1's identity boundary: a DIFFERENT handle just signed in on this browser, so every warm cache
      // entry and every durable-local blob belongs to somebody else. A full document load is the only
      // leak-free reset — the same reasoning the account modal's sign-out already runs on.
      if (identityBoundaryCrossed(reauthed.handle)) {
        resetOntoNewIdentity(reauthed.handle);
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
  runSessionRecoverySingleFlight(runLadder)
    .finally(() => {
      recovering = false;
    })
    .catch(() => {
      notify.error("Session recovery failed. Sign in again.");
      signOut();
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
    // THE LADDER MUST ALWAYS TERMINATE. `promptReauth` hands its resolver to the modal and then AWAITS it
    // while holding the recovery lock, so an unbind with a prompt still outstanding — the shell unmounting
    // out from under an open re-auth modal — used to leave `runLadder` suspended forever: `recovering` never
    // released, and every later 401 in that tab was swallowed by the single-flight latch for the life of the
    // page. Unbinding the host IS the modal going away, so its verdict is `dismissed` — the same outcome
    // `promptReauth` already returns when there is no host to prompt with, and it falls through to rung 2.
    completeReauth("dismissed");
    return;
  }
  unsubscribeSiblings = onSessionMessage((message) => {
    if (message.kind === "signed-out") {
      navigateTo(LOGIN_PATH); // a sibling signed out; this tab lands with it instead of rendering warm cache
      return;
    }
    if (message.kind === "session-recovered") {
      // A sibling re-authenticated on the SHARED cookie — this tab's reads are stale, not its session.
      // Which is true only while the recovered identity is still THIS tab's: the message names the handle
      // precisely so a follower applies the same §4.2.1 boundary the leader did. The channel proves only a
      // string; equality against this tab's authenticated Handle needs no brand, and the untrusted value is
      // never stored, forwarded, or used to build the target — that is the module constant above.
      if (identityBoundaryCrossed(message.handle)) {
        navigateTo(APP_ROOT_PATH);
        return;
      }
      markSessionFresh();
      next.resumeInPlace();
    }
  });
}
