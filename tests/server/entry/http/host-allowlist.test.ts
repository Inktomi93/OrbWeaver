// entry/http/host-allowlist — the refusal the middleware sends. The refused host is attacker-chosen and echoed back,
// so the page escapes it; a refused request never reaches a route; the fix named follows the install shape.

import { ALLOWED_HOSTS_KEY } from "@orb/kit/allowed-hosts";
import { hostAllowlist } from "@orb/server/entry/http";
import { settingInstruction } from "@orb/server/foundation/env";
import { Hono } from "hono";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OK = 200;
const MISDIRECTED = 421;
const SCRIPT_HOST = "<script>alert(1)</script>";
const ESCAPED_SCRIPT_HOST = "&lt;script&gt;alert(1)&lt;/script&gt;";
const REBOUND = "rebind.attacker.example";
// The owner's Caddy container: a private peer, so its X-Forwarded-Host is judged.
const TRUSTED_HOP = "172.18.0.100";

/** The conninfo env `@hono/node-server` binds in production, for a chosen TCP peer. */
function peerEnv(address: string): { incoming: { socket: { remoteAddress: string; remotePort: number; remoteFamily: string } } } {
  return { incoming: { socket: { remoteAddress: address, remotePort: 54_321, remoteFamily: "IPv4" } } };
}

function harness(opts: { readonly inContainer?: boolean; readonly allowedHosts?: readonly string[] } = {}): {
  readonly send: (path: string, headers: Record<string, string>, peer?: string) => Promise<Response>;
  readonly routeHits: () => number;
  readonly notice: ReturnType<typeof vi.fn>;
} {
  let hits = 0;
  const notice = vi.fn();
  const app = new Hono();
  app.use("*", hostAllowlist({ allowedHosts: opts.allowedHosts ?? [], inContainer: opts.inContainer ?? false, notice }));
  app.all("*", (c) => {
    hits += 1;
    return c.text("route");
  });
  return {
    send: (path, headers, peer = "127.0.0.1") => Promise.resolve(app.fetch(new Request(`http://localhost${path}`, { headers }), peerEnv(peer))),
    routeHits: () => hits,
    notice,
  };
}

describe("hostAllowlist", () => {
  test("an allowed host reaches the route and logs nothing", async () => {
    const h = harness();
    expect((await h.send("/api/auth/me", { host: "localhost:8788" })).status).toBe(OK);
    expect(h.routeHits()).toBe(1);
    expect(h.notice).not.toHaveBeenCalled();
  });

  test("a refused API request gets JSON naming the host, logs it, and never reaches the route", async () => {
    const h = harness();
    const res = await h.send("/api/auth/me", { host: `${REBOUND}:8788` });
    expect(res.status).toBe(MISDIRECTED);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as { host: string }).host).toBe(REBOUND);
    expect(h.routeHits()).toBe(0);
    expect(h.notice).toHaveBeenCalledExactlyOnceWith(REBOUND);
  });

  test("a script-laden Host is escaped in the refusal page", async () => {
    const h = harness();
    const res = await h.send("/", { host: SCRIPT_HOST });
    expect(res.status).toBe(MISDIRECTED);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain(ESCAPED_SCRIPT_HOST);
    expect(body).not.toContain("<script>");
  });

  test("a script-laden X-Forwarded-Host from a trusted hop is escaped too", async () => {
    const h = harness();
    const body = await (await h.send("/", { host: "localhost", "x-forwarded-host": SCRIPT_HOST }, TRUSTED_HOP)).text();
    expect(body).toContain(ESCAPED_SCRIPT_HOST);
    expect(body).not.toContain("<script>");
  });

  test("an over-long bracketed IPv6 X-Forwarded-Host is refused as a name, never a 500", async () => {
    const h = harness();
    const res = await h.send("/api/auth/me", { host: "localhost", "x-forwarded-host": "[1:2:3:4:5:6:7:8::9]" }, TRUSTED_HOP);
    expect(res.status).toBe(MISDIRECTED);
    expect(h.routeHits()).toBe(0);
  });

  test("a configured name passes", async () => {
    const h = harness({ allowedHosts: ["nas.local"] });
    expect((await h.send("/", { host: "NAS.local:8788" })).status).toBe(OK);
  });

  test("the refusal carries the install shape's fix for the refused host, and not the other shape's", async () => {
    for (const inContainer of [true, false]) {
      const body = await (await harness({ inContainer }).send("/", { host: REBOUND })).text();
      expect(body, String(inContainer)).toContain(settingInstruction(inContainer, ALLOWED_HOSTS_KEY, REBOUND));
      expect(body, String(inContainer)).not.toContain(settingInstruction(!inContainer, ALLOWED_HOSTS_KEY, REBOUND));
    }
  });
});
