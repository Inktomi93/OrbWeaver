// safeFetch is SELF-ENFORCING (D61 B5a / hub-browse H1, doc 01 §6): its SSRF posture does NOT depend on
// the global EGRESS_FIREWALL dispatcher. This suite NEVER installs the firewall — it drives safeFetch's
// OWN resolve→validate→pin + scheme pin + host allowlist + deadline directly, with an INJECTED resolver
// (no live DNS) and a STUBBED transport (no live network). Every case asserts the typed EgressBlockedError
// `reason`, and that a blocked request never reaches `fetch`.

import { __setEgressResolverForTest, ANY_HOST, safeFetch } from "@orb/server/infra/network";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const PUBLIC_ADDR = "93.184.216.34"; // example.com — the default "resolves public" answer.

/** Inject a deterministic resolver: mapped hosts return their listed addresses; anything else is public. */
function withResolver(map: Record<string, readonly string[]> = {}): void {
  __setEgressResolverForTest((host) => Promise.resolve(map[host] ?? [PUBLIC_ADDR]));
}

/** A fetch stub that records calls and returns a 200 text body (the happy terminal response). */
function stubOkFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(() => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("safeFetch self-enforcing SSRF (global firewall NOT installed)", () => {
  afterEach(() => {
    __setEgressResolverForTest(null);
    vi.unstubAllGlobals();
  });

  describe("IP-denial on the resolved address (the S6 core)", () => {
    for (const [label, addr] of [
      ["RFC1918", "10.0.0.5"],
      ["cloud-metadata link-local", "169.254.169.254"],
      ["IPv6 loopback", "::1"],
      ["IPv4-mapped RFC1918", "::ffff:192.168.1.1"],
    ] as const) {
      test(`refuses a host resolving to ${label} (${addr}) before any socket`, async () => {
        withResolver({ "internal.test": [addr] });
        const fetchSpy = stubOkFetch();
        await expect(safeFetch("https://internal.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({
          name: "EgressBlockedError",
          reason: "private-address",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }

    test("a MIXED answer [public, private] rejects the whole fetch (any private addr wins)", async () => {
      withResolver({ "mixed.test": [PUBLIC_ADDR, "10.1.2.3"] });
      const fetchSpy = stubOkFetch();
      await expect(safeFetch("https://mixed.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "private-address" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("a public-only answer PASSES (no false-positive brick)", async () => {
      withResolver({ "cdn.test": [PUBLIC_ADDR] });
      const fetchSpy = stubOkFetch();
      const res = await safeFetch("https://cdn.test/x", { allowedHosts: ANY_HOST });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("an empty resolution is blocked (unresolvable), never dialed", async () => {
      withResolver({ "void.test": [] });
      const fetchSpy = stubOkFetch();
      await expect(safeFetch("https://void.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "unresolvable" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("scheme pin (https-only unless owner-configured)", () => {
    test("a plain-http target is refused before resolve/fetch", async () => {
      const fetchSpy = stubOkFetch();
      const resolveSpy = vi.fn((): Promise<readonly string[]> => Promise.resolve([PUBLIC_ADDR]));
      __setEgressResolverForTest(resolveSpy);
      await expect(safeFetch("http://cdn.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "scheme" });
      expect(resolveSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("IP-literal hosts are refused (a hostname is required)", () => {
    for (const url of ["https://127.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/x"] as const) {
      test(url, async () => {
        const fetchSpy = stubOkFetch();
        await expect(safeFetch(url, { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "ip-literal" });
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  });

  describe("host allowlist (exact + leading-dot suffix; the URL host, never the raw string)", () => {
    test("exact host passes; a different host is refused", async () => {
      withResolver();
      stubOkFetch();
      await expect(safeFetch("https://api.chub.ai/x", { allowedHosts: ["api.chub.ai"] })).resolves.toMatchObject({ status: 200 });
      await expect(safeFetch("https://api.other.ai/x", { allowedHosts: ["api.chub.ai"] })).rejects.toMatchObject({ reason: "host-not-allowed" });
    });

    test("a leading-dot suffix matches a subdomain but REJECTS the bare apex and a lookalike", async () => {
      withResolver();
      stubOkFetch();
      await expect(safeFetch("https://cdn.charhub.io/x", { allowedHosts: [".charhub.io"] })).resolves.toMatchObject({ status: 200 });
      await expect(safeFetch("https://charhub.io/x", { allowedHosts: [".charhub.io"] })).rejects.toMatchObject({ reason: "host-not-allowed" });
      await expect(safeFetch("https://evilcharhub.io/x", { allowedHosts: [".charhub.io"] })).rejects.toMatchObject({ reason: "host-not-allowed" });
    });

    test("userinfo cannot smuggle a host: https://api.chub.ai@evil.com resolves to host evil.com → refused", async () => {
      withResolver();
      stubOkFetch();
      await expect(safeFetch("https://api.chub.ai@evil.com/x", { allowedHosts: ["api.chub.ai"] })).rejects.toMatchObject({
        reason: "host-not-allowed",
      });
    });

    test("case + a trailing dot normalize before the match", async () => {
      withResolver();
      const fetchSpy = stubOkFetch();
      await expect(safeFetch("https://API.CHUB.AI./x", { allowedHosts: ["api.chub.ai"] })).resolves.toMatchObject({ status: 200 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("redirect hops are re-validated (scheme + allowlist + IP denial, every hop)", () => {
    test("a redirect to a host that RESOLVES private is blocked at the re-dispatched hop", async () => {
      withResolver({ "start.test": [PUBLIC_ADDR], "internal.test": ["10.0.0.5"] });
      const calls: string[] = [];
      vi.stubGlobal("fetch", (u: URL | string) => {
        calls.push(String(u));
        return String(u).startsWith("https://start.test") ? Response.redirect("https://internal.test/x", 302) : new Response("ok", { status: 200 });
      });
      await expect(safeFetch("https://start.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "private-address" });
      expect(calls).toEqual(["https://start.test/x"]); // hop1 never dialed
    });

    test("a redirect OFF the allowlist is refused (host-not-allowed) on the new URL", async () => {
      withResolver();
      vi.stubGlobal("fetch", (u: URL | string) =>
        String(u).startsWith("https://good.test") ? Response.redirect("https://evil.test/x", 302) : new Response("ok", { status: 200 }),
      );
      await expect(safeFetch("https://good.test/x", { allowedHosts: ["good.test"] })).rejects.toMatchObject({ reason: "host-not-allowed" });
    });

    test("a redirect that DOWNGRADES to http is refused (scheme) on the new URL", async () => {
      withResolver();
      vi.stubGlobal("fetch", (u: URL | string) =>
        String(u).startsWith("https://good.test") ? Response.redirect("http://good.test/x", 302) : new Response("ok", { status: 200 }),
      );
      await expect(safeFetch("https://good.test/x", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "scheme" });
    });

    test("maxRedirects:0 makes a redirect an error (too-many-redirects), never followed", async () => {
      withResolver();
      const fetchSpy = vi.fn(() => Response.redirect("https://good.test/next", 302));
      vi.stubGlobal("fetch", fetchSpy);
      await expect(safeFetch("https://good.test/x", { allowedHosts: ANY_HOST, maxRedirects: 0 })).rejects.toMatchObject({
        reason: "too-many-redirects",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("deadline (S5 — a deadline ALWAYS exists, even with no caller signal)", () => {
    test("deadlineMs fires with no caller signal → EgressBlockedError(deadline)", async () => {
      withResolver();
      // The transport hangs until aborted; the composed deadline signal aborts it.
      vi.stubGlobal(
        "fetch",
        (_u: URL | string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      await expect(safeFetch("https://slow.test/x", { allowedHosts: ANY_HOST, deadlineMs: 20 })).rejects.toMatchObject({ reason: "deadline" });
    });

    test("the deadline ALSO bounds a slow-loris BODY read (headers arrive, body never completes)", async () => {
      withResolver();
      // Headers land immediately; the body stream drips one byte then stalls forever — bounded ONLY by the
      // total deadline (the byte cap never trips). Aborting the fetch signal errors the in-flight stream.
      vi.stubGlobal("fetch", (_u: URL | string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "application/octet-stream" } });
      });
      const res = await safeFetch("https://drip.test/x", { allowedHosts: ANY_HOST, deadlineMs: 20 });
      await expect(res.bytes()).rejects.toMatchObject({ reason: "deadline" });
    });
  });

  describe("owner-configured-endpoint policy (the /models class): host-pinned, but private + http permitted", () => {
    test("a plain-http LAN IP-literal endpoint is allowed (defers SSRF to the global firewall)", async () => {
      const resolveSpy = vi.fn((): Promise<readonly string[]> => Promise.resolve([PUBLIC_ADDR]));
      __setEgressResolverForTest(resolveSpy);
      const fetchSpy = stubOkFetch();
      const res = await safeFetch("http://192.168.1.50:8000/models", { allowedHosts: ["192.168.1.50"], ownerConfiguredEndpoint: true });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // ownerConfiguredEndpoint skips safeFetch's own resolve→validate→pin (the firewall gates the connect).
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    test("still host-pinned: a redirect off the configured host is refused", async () => {
      __setEgressResolverForTest(() => Promise.resolve([PUBLIC_ADDR]));
      vi.stubGlobal("fetch", (u: URL | string) =>
        String(u).startsWith("http://192.168.1.50") ? Response.redirect("http://10.0.0.9/x", 302) : new Response("ok", { status: 200 }),
      );
      await expect(safeFetch("http://192.168.1.50:8000/models", { allowedHosts: ["192.168.1.50"], ownerConfiguredEndpoint: true })).rejects.toMatchObject({
        reason: "host-not-allowed",
      });
    });
  });
});
