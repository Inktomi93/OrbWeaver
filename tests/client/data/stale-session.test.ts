// The stale-session RECOVERY LADDER (#23b, extended per staleness-and-session-freshness.md §4.4). What
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

const MODULE = "../../../packages/client/src/data/stale-session.ts";
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

/** A same-process BroadcastChannel so the ladder's posts have somewhere to go (and can be observed). */
class FakeBroadcastChannel {
  static posted: unknown[] = [];
  addEventListener(): void {
    /* the ladder subscribes; no sibling posts in these cases */
  }
  postMessage(data: unknown): void {
    FakeBroadcastChannel.posted.push(data);
  }
  close(): void {
    /* nothing to release */
  }
}

async function ladderFor(scenario: Scenario): Promise<{ readonly ladder: Ladder; readonly rec: Recorder }> {
  vi.resetModules();
  FakeBroadcastChannel.posted = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.stubGlobal("navigator", undefined); // no Web Locks in node — the same-tab fallback path
  vi.stubGlobal("sessionStorage", undefined);

  const assign = vi.fn();
  vi.stubGlobal("location", { pathname: scenario.pathname ?? "/", assign });

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
