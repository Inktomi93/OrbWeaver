// The stale-session RECOVERY LADDER (#23b, extended per). What
// this file pins is the RUNG each verdict lands on, and — the part that is the whole point of the redesign
// — that rung 0 does NOT navigate. The old belt's only behavior was `location.assign("/login")`, which
// threw away the query cache, the open chat and every draft to fix a cookie.
//
// The module is page-scoped state (a host, a sibling subscription, two latches), so every case re-imports
// it fresh; `fetch` is stubbed per case because the ladder's sensors are `/api/auth/me` + `/api/auth/config`
// (the two PUBLIC endpoints — `sessions.me` 401s on exactly the state being recovered from).

import type { AuthMode } from "@orb/contracts/identity";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { reimportBudget } from "../../support/reimport-budget.ts";

// Every case re-imports the ladder fresh (see the header), so the first one pays a full transform of the
// module's graph inside its own timer. Measured cold and alone on a quiet box (2026-09-19,
// `pnpm test:scoped … --reporter=verbose`): first test 2268 ms, the other 23 between 31 and 142 ms. 30 s
// is that number with the contention headroom `reimportBudget`'s header derives; the 5 s project default
// is what reds this file in a cold scoped run.
vi.setConfig({ testTimeout: reimportBudget(30_000) });

const MODULE = "../../../packages/client/src/data/stale-session.ts";
const DOCUMENT_HOST_MODULE = "../../../packages/client/src/lib/session-document-host.ts";
const UNAUTHORIZED = { data: { code: "UNAUTHORIZED" } };
const OWNER = castId<Handle>("owner");
const SOMEONE_ELSE = castId<Handle>("someone-else");
const CHAT_OPEN = castId<ChatId>("chat_open");

type Ladder = typeof import("../../../packages/client/src/data/stale-session.ts");

interface Recorder {
  readonly assign: ReturnType<typeof vi.fn>;
  readonly resumes: () => number;
  readonly prompts: () => number;
  readonly authMeCalls: () => number;
}

interface Scenario {
  /** `/api/auth/me` verdicts, consumed in order; the last one repeats. */
  readonly me: readonly { readonly authenticated: boolean; readonly handle: Handle | null }[];
  readonly mode: AuthMode;
  readonly pathname?: string;
  /** Bind a host (the mounted shell). Omit to exercise the unbound degrade. */
  readonly host?: boolean;
  readonly currentHandle?: Handle | null;
}

/** A same-process BroadcastChannel so the ladder's posts have somewhere to go (and can be observed), plus
 *  a `deliver` seam for the other direction — a real channel never echoes to its own poster, so a SIBLING
 *  tab's verdict can only be simulated by handing the module's own listener an event. */
class FakeBroadcastChannel {
  static posted: unknown[] = [];
  static listeners: ((event: { readonly data: unknown }) => void)[] = [];
  addEventListener(_type: string, listener: (event: { readonly data: unknown }) => void): void {
    FakeBroadcastChannel.listeners.push(listener);
  }
  postMessage(data: unknown): void {
    FakeBroadcastChannel.posted.push(data);
  }
  close(): void {
    /* nothing to release */
  }

  /** Post as if ANOTHER TAB sent it — the receiver half of the cross-tab protocol. */
  static deliver(data: unknown): void {
    for (const listener of [...FakeBroadcastChannel.listeners]) {
      listener({ data });
    }
  }
}

async function ladderFor(scenario: Scenario): Promise<{ readonly ladder: Ladder; readonly rec: Recorder }> {
  vi.resetModules();
  FakeBroadcastChannel.posted = [];
  FakeBroadcastChannel.listeners = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.stubGlobal("navigator", undefined); // no Web Locks in node — the same-tab fallback path
  vi.stubGlobal("sessionStorage", undefined);

  const assign = vi.fn();
  const documentHost = await import(DOCUMENT_HOST_MODULE);
  documentHost.bindSessionDocumentHost({
    currentPathname: (): string => scenario.pathname ?? "/",
    assign,
    isVisible: (): false => false,
    subscribeVisibility: (): (() => void) => (): void => undefined,
  });

  let authMeCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/auth/me") {
        const verdict = scenario.me[Math.min(authMeCalls, scenario.me.length - 1)];
        authMeCalls += 1;
        return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve({ ...verdict, role: null }) });
      }
      return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve({ mode: scenario.mode }) });
    }),
  );

  const ladder = (await import(MODULE)) as Ladder;
  let resumes = 0;
  let prompts = 0;
  if (scenario.host !== false) {
    ladder.bindSessionRecovery({
      resumeInPlace: (): void => {
        resumes += 1;
      },
      openReauthPrompt: (): void => {
        prompts += 1;
      },
      resumeChatId: (): ChatId | null => CHAT_OPEN,
      currentHandle: (): Handle | null => scenario.currentHandle ?? OWNER,
    });
  }
  return {
    ladder,
    rec: { assign, resumes: (): number => resumes, prompts: (): number => prompts, authMeCalls: (): number => authMeCalls },
  };
}

beforeEach(() => {
  FakeBroadcastChannel.posted = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the belt's trigger (unchanged from #23b)", () => {
  test("a non-UNAUTHORIZED error (FORBIDDEN / NOT_FOUND / plain throw) never enters the ladder", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local" });
    ladder.recoverIfStaleSession({ data: { code: "FORBIDDEN" } });
    ladder.recoverIfStaleSession({ data: { code: "NOT_FOUND" } });
    ladder.recoverIfStaleSession(new Error("network blip"));
    expect(rec.authMeCalls()).toBe(0);
    expect(rec.assign).not.toHaveBeenCalled();
  });

  // The QueryCache `onError` hands the belt whatever was thrown — `unknown` includes `null`/`undefined` and
  // bare primitives. A `.data` read on those THROWS *inside* the cache callback, taking the always-on belt
  // down with it on exactly the errors it exists to survive.
  test("a null / undefined / primitive error is a no-op, never a throw inside the QueryCache callback", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local" });
    for (const value of [null, undefined, "UNAUTHORIZED", 0, false]) {
      expect(() => ladder.recoverIfStaleSession(value)).not.toThrow();
    }
    expect(rec.authMeCalls()).toBe(0);
  });

  test("already on /login → the ladder never starts (the loop guard)", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local", pathname: "/login" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.authMeCalls()).toBe(0));
    expect(rec.assign).not.toHaveBeenCalled();
  });

  // W1's entry point: the socket hands a bare CODE, not an error object.
  test("`recoverIfUnauthorizedCode` claims UNAUTHORIZED and declines every other code", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local" });
    expect(ladder.recoverIfUnauthorizedCode("INTERNAL_SERVER_ERROR")).toBe(false);
    expect(ladder.recoverIfUnauthorizedCode(undefined)).toBe(false);
    expect(rec.authMeCalls()).toBe(0);
    expect(ladder.recoverIfUnauthorizedCode("UNAUTHORIZED")).toBe(true);
    await vi.waitFor(() => expect(rec.authMeCalls()).toBe(1));
  });
});

describe("rung 0 — probe and resume IN PLACE", () => {
  // THE headline behavior change. Under single-user/forward-header (and after a sibling tab already
  // recovered, and on a plain blip) the probe says `authenticated`, and the tab must carry on with its
  // cache intact. Yesterday this was a full document load, every time.
  test("an authenticated probe resumes with NO navigation and re-reads identity + user roots", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "single-user" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.resumes()).toBe(1));
    expect(rec.assign).not.toHaveBeenCalled();
    expect(FakeBroadcastChannel.posted).toContainEqual({ kind: "session-recovered", handle: OWNER });
  });

  test("a burst of 401s runs ONE ladder (single-flight), and a later death can re-enter", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "single-user" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.resumes()).toBe(1));
    expect(rec.authMeCalls()).toBe(1);
    // The latch releases on the VERDICT — a resumed tab whose session dies again must recover again.
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.resumes()).toBe(2));
  });

  // §4.2.1's IDENTITY BOUNDARY, at the rung it was never wired to. `authenticated: true` answers "is there
  // a session", not "is it OURS": on a shared browser (or after the dev latch re-mints identities) the
  // session this tab's 401 just discovered can belong to somebody else, and resuming keeps the PREVIOUS
  // human's chats, characters and drafts on screen while every subsequent read and write runs as the new
  // one. Rung 1 has performed exactly this compare since it was built; rung 0 is the same boundary.
  test("an authenticated probe as a DIFFERENT handle hard-reloads instead of resuming in place", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: SOMEONE_ELSE }], mode: "local", currentHandle: OWNER });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/"));
    expect(rec.resumes()).toBe(0);
    // The verdict still BROADCASTS, carrying the new identity: a sibling tab holding the old one must
    // reload itself too, rather than render the previous human's cache until its own next edge.
    expect(FakeBroadcastChannel.posted).toContainEqual({ kind: "session-recovered", handle: SOMEONE_ELSE });
  });

  // FAIL CLOSED. The belt fires from `query-client.ts`, which is constructed before React mounts, so "no
  // host bound" is a real state — and one with nothing to compare against. An unprovable identity takes the
  // hard-reload arm; a resume is only ever offered to a cache this tab can show is its own.
  test("with NO host bound, an authenticated probe hard-reloads rather than resuming blind", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", host: false });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/"));
  });

  // Unreachable ≠ signed out: the route guard draws the same line, and a hard redirect on a wifi blip is a
  // worse defect than the one being fixed.
  test("an unreachable probe neither resumes nor navigates", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local" });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1));
    expect(rec.resumes()).toBe(0);
    expect(rec.assign).not.toHaveBeenCalled();
  });
});

describe("rung 1 — re-auth in place", () => {
  test("local mode opens the modal; a same-handle success resumes WITHOUT navigating", async () => {
    const { ladder, rec } = await ladderFor({
      me: [
        { authenticated: false, handle: null },
        { authenticated: true, handle: OWNER },
      ],
      mode: "local",
      currentHandle: OWNER,
    });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.prompts()).toBe(1));
    ladder.completeReauth("recovered");
    await vi.waitFor(() => expect(rec.resumes()).toBe(1));
    expect(rec.assign).not.toHaveBeenCalled();
  });

  // §4.2.1's identity boundary: a DIFFERENT human signed in on this browser, so every warm cache entry and
  // every durable-local blob belongs to someone else. A full document load is the only leak-free reset.
  test("local mode with a DIFFERENT handle hard-reloads instead of resuming", async () => {
    const { ladder, rec } = await ladderFor({
      me: [
        { authenticated: false, handle: null },
        { authenticated: true, handle: SOMEONE_ELSE },
      ],
      mode: "local",
      currentHandle: OWNER,
    });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.prompts()).toBe(1));
    ladder.completeReauth("recovered");
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/"));
    expect(rec.resumes()).toBe(0);
  });

  test("dismissing the prompt falls through to rung 2 (interactive login)", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.prompts()).toBe(1));
    ladder.completeReauth("dismissed");
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/login"));
  });

  // THE LADDER MUST ALWAYS TERMINATE (#1489). `promptReauth` awaits the modal's verdict while holding the
  // recovery lock, so if the shell unmounts under an open prompt there is nobody left to call
  // `completeReauth` — `runLadder` stayed suspended, `recovering` never released, and every later 401 in
  // that tab was swallowed by the single-flight latch for the life of the page. Unbinding the host IS the
  // modal going away, so it settles the outstanding prompt as `dismissed` and rung 2 finishes the job.
  test("unbinding the host mid-prompt settles the ladder instead of wedging it forever", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.prompts()).toBe(1));
    ladder.bindSessionRecovery(null);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/login"));
  });

  test("oidc mode bounces to the IdP start route (F3), never to a modal", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "oidc" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/api/auth/oidc/login"));
    expect(rec.prompts()).toBe(0);
  });

  // The belt fires from `query-client.ts`, which is constructed BEFORE React mounts. An unbound host must
  // degrade to rung 2, not hang the ladder on a modal nobody can render.
  test("with NO host bound, a dead local session goes straight to rung 2", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local", host: false });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/login"));
  });
});

describe("rung 2 — signed out, coordinated", () => {
  test("the sign-out is BROADCAST so sibling tabs land with it instead of stampeding", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "forward-header" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/login"));
    expect(FakeBroadcastChannel.posted).toContainEqual({ kind: "signed-out" });
  });

  test("a navigated tab never fires a SECOND navigation (the original loop guard, kept)", async () => {
    const { ladder, rec } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "forward-header" });
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledWith("/login"));
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    ladder.recoverIfStaleSession(UNAUTHORIZED);
    await vi.waitFor(() => expect(rec.assign).toHaveBeenCalledOnce());
  });
});

// The FOLLOWER half of the cross-tab protocol: this tab ran no ladder (a sibling held the lock) and learns
// the verdict from the broadcast alone. The message carries `handle` precisely so the follower can apply the
// same §4.2.1 boundary the leader did — a sibling that recovered as SOMEBODY ELSE is not this tab's recovery.
describe("the sibling-tab verdict receiver", () => {
  test("a sibling's SAME-handle recovery resumes this tab in place", async () => {
    const { rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", currentHandle: OWNER });
    FakeBroadcastChannel.deliver({ kind: "session-recovered", handle: OWNER });
    expect(rec.resumes()).toBe(1);
    expect(rec.assign).not.toHaveBeenCalled();
  });

  test("a sibling's DIFFERENT-handle recovery hard-reloads this tab instead of resuming it", async () => {
    const { rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", currentHandle: OWNER });
    FakeBroadcastChannel.deliver({ kind: "session-recovered", handle: SOMEONE_ELSE });
    expect(rec.assign).toHaveBeenCalledWith("/");
    expect(rec.resumes()).toBe(0);
  });

  test("a sibling's sign-out still lands this tab on /login (unchanged)", async () => {
    const { rec } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", currentHandle: OWNER });
    FakeBroadcastChannel.deliver({ kind: "signed-out" });
    expect(rec.assign).toHaveBeenCalledWith("/login");
  });
});

// The VISIBILITY PROBE's verdict (§4.4.1), decided here because this is where the identity boundary lives.
// It is the sensor for the case the ladder alone cannot see: when another identity signs in on this browser
// the cookie is VALID, so this warm tab never 401s — nothing enters the ladder, and without an identity
// compare the probe would mark the session fresh and let the tab keep running on the previous human's cache.
describe("the freshness probe's continuity verdict", () => {
  test("a live session as the SAME handle is fresh", async () => {
    const { ladder } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", currentHandle: OWNER });
    await expect(ladder.probeSessionContinuity()).resolves.toBe(true);
  });

  test("a live session as a DIFFERENT handle is NOT fresh — it hands off to the ladder", async () => {
    const { ladder } = await ladderFor({ me: [{ authenticated: true, handle: SOMEONE_ELSE }], mode: "local", currentHandle: OWNER });
    await expect(ladder.probeSessionContinuity()).resolves.toBe(false);
  });

  test("a dead session is NOT fresh", async () => {
    const { ladder } = await ladderFor({ me: [{ authenticated: false, handle: null }], mode: "local", currentHandle: OWNER });
    await expect(ladder.probeSessionContinuity()).resolves.toBe(false);
  });

  // The rejection must PROPAGATE: `startSessionFreshness` reads a thrown probe as "server unreachable" and
  // does nothing, while `false` is a verdict that enters the ladder. Swallowing it here would sign a user
  // out of a working app because their wifi blinked.
  test("an unreachable probe REJECTS rather than reporting a verdict", async () => {
    const { ladder } = await ladderFor({ me: [{ authenticated: true, handle: OWNER }], mode: "local", currentHandle: OWNER });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    await expect(ladder.probeSessionContinuity()).rejects.toThrow("offline");
  });
});
