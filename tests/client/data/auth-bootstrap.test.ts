// data/auth-bootstrap — the session half of the pre-tRPC seam (fetchAuthMe/login/logout). `fetch` is
// stubbed at the global boundary (the auth-config.test.ts precedent). Pins the wire contracts a feature
// can't see from the types: login posts a FORM body (the route parses `parseBody`, JSON would silently
// 401), a refusal surfaces the SERVER's generic message (never an enumerating one we invent), and logout
// carries the CSRF header (a cookie mutation without it is a 403 — the belt every logout regression hits).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, beforeEach, vi } from "vitest";
import { confirmPendingJoin, fetchAuthMe, login, logout, signOut } from "../../../packages/client/src/data/auth-bootstrap.ts";
import { bindSessionDocumentHost } from "../../../packages/client/src/lib/session-document-host.ts";
import { expect, test } from "../../support/fixtures.ts";

const signOutOrder: string[] = [];
const assigned: string[] = [];

class FakeBroadcastChannel {
  static posted: unknown[] = [];
  addEventListener(): void {
    /* no sibling messages in this suite */
  }
  postMessage(message: unknown): void {
    FakeBroadcastChannel.posted.push(message);
    signOutOrder.push("broadcast");
  }
  unref(): void {
    /* node test handle */
  }
}

beforeEach(() => {
  signOutOrder.length = 0;
  assigned.length = 0;
  FakeBroadcastChannel.posted = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  bindSessionDocumentHost({
    currentPathname: (): string => "/",
    assign: (path): void => {
      assigned.push(path);
      signOutOrder.push("navigate");
    },
    isVisible: (): true => true,
    subscribeVisibility: (): (() => void) => (): void => undefined,
  });
});

afterEach(() => {
  bindSessionDocumentHost(null);
  vi.unstubAllGlobals();
});

test("fetchAuthMe returns the parsed wire shape; a non-ok status throws", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ authenticated: true, handle: "alice", role: "user" }), { status: 200 })));
  await expect(fetchAuthMe()).resolves.toEqual({ authenticated: true, handle: "alice", role: "user" });

  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 500 })));
  await expect(fetchAuthMe()).rejects.toThrow("HTTP 500");
});

test("login posts a urlencoded FORM body (not JSON) with same-origin credentials", async () => {
  let seen: RequestInit | undefined;
  vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
    seen = init;
    return Promise.resolve(new Response("", { status: 200 }));
  });
  await login(castId<Handle>("alice"), "hunter22222");
  expect(seen?.method).toBe("POST");
  expect(seen?.credentials).toBe("same-origin");
  expect(seen?.body).toBeInstanceOf(URLSearchParams);
  expect((seen?.body as URLSearchParams).get("handle")).toBe("alice");
});

test("a login refusal throws the SERVER's message (LoginFailedError, never an invented one)", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 })));
  const err = await login(castId<Handle>("alice"), "wrong").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).name).toBe("LoginFailedError");
  expect((err as Error).message).toBe("invalid credentials");
});

test("logout carries the CSRF header (the cookie-mutation belt) and throws on refusal", async () => {
  let headers: RequestInit["headers"];
  vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
    headers = init?.headers;
    return Promise.resolve(new Response("", { status: 200 }));
  });
  await logout();
  expect(headers).toMatchObject({ "x-orb-csrf": "1" });

  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 403 })));
  await expect(logout()).rejects.toThrow("logout failed (HTTP 403)");
});

test("signOut revokes with CSRF, broadcasts, then hard-navigates to the IdP end-session URL", async () => {
  const requests: { readonly url: string; readonly init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    signOutOrder.push("logout");
    return Promise.resolve(new Response(JSON.stringify({ endSessionUrl: "/oidc/end-session" }), { status: 200 }));
  });

  await signOut();

  const request = requests[0];
  expect(request).toBeDefined();
  if (request === undefined) {
    throw new Error("logout request was not captured");
  }
  expect(request.url).toBe("/api/auth/logout");
  expect(request.init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "x-orb-csrf": "1" } });
  expect(FakeBroadcastChannel.posted).toEqual([{ kind: "signed-out" }]);
  expect(assigned).toEqual(["/oidc/end-session"]);
  expect(signOutOrder).toEqual(["logout", "broadcast", "navigate"]);
});

test("signOut falls back to /login when logout returns no IdP end-session URL", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200 })));

  await signOut();

  expect(FakeBroadcastChannel.posted).toEqual([{ kind: "signed-out" }]);
  expect(assigned).toEqual(["/login"]);
});

test("a failed logout neither broadcasts nor navigates", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 403 })));

  await expect(signOut()).rejects.toThrow("logout failed (HTTP 403)");

  expect(FakeBroadcastChannel.posted).toEqual([]);
  expect(assigned).toEqual([]);
});

// D259 — the OIDC pending-join confirm: a JSON body carrying only the joiner's persona under the CSRF header (the
// pending cookie names the join), `signedIn` read through the strict result schema, and a refusal code only when
// it is a known one.
const JOINER = { persona: { name: "Mira", description: "" } } as const;

test("confirmPendingJoin posts the persona-only JSON body with CSRF and reads signedIn", async () => {
  let seen: { readonly url: string; readonly init: RequestInit | undefined } | undefined;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ signedIn: false }), { status: 200 }));
  });
  await expect(confirmPendingJoin(JOINER)).resolves.toEqual({ ok: true, signedIn: false });
  expect(seen?.url).toBe("/api/auth/oidc/pending/confirm");
  expect(seen?.init?.method).toBe("POST");
  expect(seen?.init?.headers).toMatchObject({ "x-orb-csrf": "1", "content-type": "application/json" });
  expect(JSON.parse(String(seen?.init?.body))).toEqual(JOINER);
});

test("confirmPendingJoin returns a known refusal code, and null for an unknown or unreadable body", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "account_exists" }), { status: 409 })));
  await expect(confirmPendingJoin(JOINER)).resolves.toEqual({ ok: false, code: "account_exists" });

  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "something_else" }), { status: 404 })));
  await expect(confirmPendingJoin(JOINER)).resolves.toEqual({ ok: false, code: null });

  vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>", { status: 429 })));
  await expect(confirmPendingJoin(JOINER)).resolves.toEqual({ ok: false, code: null });
});

test("confirmPendingJoin refuses a success body that is not the strict result shape", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ signedIn: true, userId: "u" }), { status: 200 })));
  await expect(confirmPendingJoin(JOINER)).rejects.toThrow();
});
