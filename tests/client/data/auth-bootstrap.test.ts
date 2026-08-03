// data/auth-bootstrap — the session half of the pre-tRPC seam (fetchAuthMe/login/logout). `fetch` is
// stubbed at the global boundary (the auth-config.test.ts precedent). Pins the wire contracts a feature
// can't see from the types: login posts a FORM body (the route parses `parseBody`, JSON would silently
// 401), a refusal surfaces the SERVER's generic message (never an enumerating one we invent), and logout
// carries the CSRF header (a cookie mutation without it is a 403 — the belt every logout regression hits).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { fetchAuthMe, login, logout } from "../../../packages/client/src/data/auth-bootstrap.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
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
