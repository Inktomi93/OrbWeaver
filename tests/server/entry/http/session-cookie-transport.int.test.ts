// Rule C and Rule E over real logins: the session cookie follows the request's transport, logout reads only that
// transport's cookie behind its CSRF gate, and a plain-http mint from the public internet logs once per client hour.
// @subject packages/server/src/entry/http/auth-routes.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import { isPlainObject } from "@orb/kit/guards";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { MS_PER_HOUR } from "@orb/kit/time";
import { getLog } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { cookieHeader } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { describe, vi } from "vitest";
import { authMe, signedInMember } from "../_auth-roots.ts";

const LAN_PEER = "192.168.1.55";
const PROXY_PEER = "172.18.0.5";
const PUBLIC_PEER = "203.0.113.9";
const OTHER_PUBLIC_PEER = "198.51.100.4";
const LOOPBACK = "127.0.0.1";
const PROXY_HTTPS = { "x-forwarded-proto": "https" };
const SECURE_NAME = "__Host-orb_session";
const INSECURE_NAME = "orb_session_insecure";
const PUBLIC_HTTP_EVENT = "session_minted_over_public_http";
const PASSWORD = "session-cookie-transport-password";
const HANDLE = "transport-member";

interface Box extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly at: (peer: string) => void;
  readonly login: (headers?: Record<string, string>) => Promise<Response>;
}

async function box(): Promise<Box> {
  let peer = LAN_PEER;
  const root = await createServerHarness({ physicalPeer: () => peer, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  await root.services.admin.createUser({ principal: await root.principalFor(root.ownerId), handle: castId<Handle>(HANDLE), password: PASSWORD });
  return {
    root,
    [Symbol.asyncDispose]: () => root[Symbol.asyncDispose](),
    at: (next): void => {
      peer = next;
    },
    login: (headers = {}): Promise<Response> =>
      Promise.resolve(
        root.http.request("/api/auth/login", {
          method: "POST",
          headers: { [CSRF_HEADER]: "1", ...headers },
          body: new URLSearchParams({ handle: HANDLE, password: PASSWORD }),
        }),
      ),
  };
}

function names(response: Response): string[] {
  return response.headers.getSetCookie().map((line) => line.split("=")[0] ?? "");
}

describe("logout — CSRF gate (real app)", () => {
  test("cross-site force-logout: cookie present but NO CSRF header → 403, no revoke", async () => {
    await using root = await createServerHarness({ physicalPeer: () => LAN_PEER, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
    const { cookie } = await signedInMember(root, castId<Handle>("force-logout-victim"));
    const forged = await root.http.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(forged.status).toBe(403);
    expect(forged.headers.getSetCookie()).toEqual([]);
    expect((await authMe(root, { cookie })).authenticated).toBe(true);
  });

  test("with the CSRF header → revokes + clears (200, A6)", async () => {
    await using root = await createServerHarness({ physicalPeer: () => LAN_PEER, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
    const { cookie } = await signedInMember(root, castId<Handle>("logout-member"));
    expect((await authMe(root, { cookie })).authenticated).toBe(true);
    const logout = await root.http.request("/api/auth/logout", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1" } });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().every((line) => line.includes("Max-Age=0"))).toBe(true);
    expect((await authMe(root, { cookie })).authenticated).toBe(false);
  });
});

describe("Rule C — the minted cookie follows the request's transport", () => {
  test("plain http from a LAN peer → the insecure name without Secure, and the __Host- name cleared", async () => {
    await using lan = await box();
    const response = await lan.login();
    expect(response.status).toBe(200);
    const [minted, cleared] = response.headers.getSetCookie();
    expect(minted).toMatch(new RegExp(`^${INSECURE_NAME}=[^;]+;`, "u"));
    expect(minted).not.toContain("Secure");
    for (const attribute of ["HttpOnly", "SameSite=Lax", "Path=/"]) {
      expect(minted).toContain(attribute);
    }
    expect(cleared).toMatch(new RegExp(`^${SECURE_NAME}=;`, "u"));
    expect(cleared).toContain("Max-Age=0");
  });

  test("https asserted by a trusted proxy peer → the __Host- name with Secure, and the insecure name cleared", async () => {
    await using proxied = await box();
    proxied.at(PROXY_PEER);
    const [minted, cleared] = (await proxied.login(PROXY_HTTPS)).headers.getSetCookie();
    expect(minted).toMatch(new RegExp(`^${SECURE_NAME}=[^;]+;`, "u"));
    expect(minted).toContain("Secure");
    expect(cleared).toMatch(new RegExp(`^${INSECURE_NAME}=;`, "u"));
  });

  test("a PUBLIC peer forging X-Forwarded-Proto: https is still minted the http cookie", async () => {
    await using forged = await box();
    forged.at(PUBLIC_PEER);
    expect(names(await forged.login(PROXY_HTTPS))[0]).toBe(INSECURE_NAME);
  });

  test("logout reads only this transport's cookie, and clears both names", async () => {
    await using both = await box();
    const http = cookieHeader(await both.login());
    both.at(PROXY_PEER);
    const https = cookieHeader(await both.login(PROXY_HTTPS));
    const cookie = `${http}; ${https}`;
    both.at(LAN_PEER);
    const overHttp = await both.root.http.request("/api/auth/logout", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1" } });
    expect((await authMe(both.root, { cookie: http })).authenticated).toBe(false);
    both.at(PROXY_PEER);
    expect((await authMe(both.root, { cookie: https, ...PROXY_HTTPS })).authenticated).toBe(true);
    const overHttps = await both.root.http.request("/api/auth/logout", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1", ...PROXY_HTTPS } });
    expect((await authMe(both.root, { cookie: https, ...PROXY_HTTPS })).authenticated).toBe(false);
    for (const response of [overHttp, overHttps]) {
      expect(names(response)).toEqual([SECURE_NAME, INSECURE_NAME]);
    }
  });
});

describe("Rule E — a plain-http mint from a public client logs once per client per hour", () => {
  function noticed(warn: { readonly mock: { readonly calls: readonly (readonly unknown[])[] } }): unknown[] {
    return warn.mock.calls.flatMap(([fields]) => (isPlainObject(fields) && fields["event"] === PUBLIC_HTTP_EVENT ? [fields["clientIp"]] : []));
  }

  test("a router port-forward (public peer, plain http) logs one line per client per hour", async () => {
    await using forwarded = await box();
    using warn = vi.spyOn(getLog(), "warn");
    forwarded.at(PUBLIC_PEER);
    expect((await forwarded.login()).status).toBe(200);
    await forwarded.login();
    forwarded.at(OTHER_PUBLIC_PEER);
    await forwarded.login();
    expect(noticed(warn)).toEqual([PUBLIC_PEER, OTHER_PUBLIC_PEER]);
    forwarded.root.clock.advance(MS_PER_HOUR);
    forwarded.at(PUBLIC_PEER);
    await forwarded.login();
    expect(noticed(warn)).toEqual([PUBLIC_PEER, OTHER_PUBLIC_PEER, PUBLIC_PEER]);
  });

  test("a public client behind a same-host proxy without TLS is keyed by its forwarded address", async () => {
    await using sameHost = await box();
    using warn = vi.spyOn(getLog(), "warn");
    sameHost.at(LOOPBACK);
    await sameHost.login({ "x-forwarded-for": "203.0.113.20" });
    expect(noticed(warn)).toEqual(["203.0.113.20"]);
  });

  test("a LAN client over plain http and a public client over proxied https log nothing", async () => {
    await using quiet = await box();
    using warn = vi.spyOn(getLog(), "warn");
    expect((await quiet.login()).status).toBe(200);
    quiet.at(PROXY_PEER);
    expect((await quiet.login({ "x-forwarded-for": "203.0.113.21", ...PROXY_HTTPS })).status).toBe(200);
    expect(noticed(warn)).toEqual([]);
  });
});
