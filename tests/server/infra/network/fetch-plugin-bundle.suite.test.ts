// fetchPluginBundle — the URL-INSTALL egress fetch (U8, seam 15; the security-review
// subject). It is a thin wrapper over `safeFetch(url, { allowedHosts: ANY_HOST, maxBytes: 1 MiB })`, so the full
// SSRF matrix (redirects, allowlist, userinfo smuggling, deadlines) is already pinned in
// `safefetch-selfenforcing.suite.test.ts`. What THIS suite pins is the security-load-bearing claim specific to
// the URL install: that fetchPluginBundle actually ROUTES THROUGH that guard — a bare `fetch(attackerUrl)` would
// pass every case here — AND that it carries the tighter 1 MiB plugin-bundle download cap (the DoS bound before
// `parseBundle` ever allocates). Injected resolver + stubbed transport (no live DNS, no live network).

import { __setEgressResolverForTest, EgressBlockedError, fetchPluginBundle } from "@orb/server/infra/network";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const PUBLIC_ADDR = "93.184.216.34";

function withResolver(map: Record<string, readonly string[]> = {}): void {
  __setEgressResolverForTest((host) => Promise.resolve(map[host] ?? [PUBLIC_ADDR]));
}

/** Stub the global fetch to return a 200 body of `body` bytes (a zip's leading magic, so a downstream parse
 *  would at least start) — the happy terminal response for the positive-control + body-cap arms. */
function stubFetch(body: Uint8Array): ReturnType<typeof vi.fn> {
  // Wrap in a Blob so the body is a structural `BodyInit` regardless of the Uint8Array's buffer variance, and so
  // the Response carries a real readable stream `safeFetch`'s capped reader consumes.
  const spy = vi.fn(() => new Response(new Blob([new Uint8Array(body)]), { status: 200, headers: { "content-type": "application/zip" } }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("fetchPluginBundle routes an attacker-named URL through the SSRF guard (never a bare fetch)", () => {
  afterEach(() => {
    __setEgressResolverForTest(null);
    vi.unstubAllGlobals();
  });

  // RED-FIRST: the headline attack. An attacker names a URL whose host resolves to a private/reserved address
  // (SSRF into the box's own network / cloud metadata). fetchPluginBundle must refuse it BEFORE any socket.
  for (const [label, addr] of [
    ["RFC1918", "10.0.0.5"],
    ["cloud-metadata link-local", "169.254.169.254"],
    ["IPv6 loopback", "::1"],
  ] as const) {
    test(`refuses a bundle URL whose host resolves to ${label} (${addr}) — no socket`, async () => {
      withResolver({ "collector.internal": [addr] });
      const fetchSpy = stubFetch(new Uint8Array([0x50, 0x4b]));
      await expect(fetchPluginBundle("https://collector.internal/plugin.zip")).rejects.toMatchObject({
        name: "EgressBlockedError",
        reason: "private-address",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  test("refuses an IP-LITERAL bundle URL (the cloud-metadata shape a hostname pin would miss)", async () => {
    const fetchSpy = stubFetch(new Uint8Array([0x50, 0x4b]));
    await expect(fetchPluginBundle("https://169.254.169.254/plugin.zip")).rejects.toMatchObject({ reason: "ip-literal" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("refuses a plain-HTTP bundle URL (https-only; no scheme downgrade)", async () => {
    const fetchSpy = stubFetch(new Uint8Array([0x50, 0x4b]));
    await expect(fetchPluginBundle("http://plugins.example.com/plugin.zip")).rejects.toMatchObject({ reason: "scheme" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // POSITIVE CONTROL: prove the guard is not just "reject everything" — a public https host returns its bytes.
  test("a public https host RETURNS the fetched bytes (positive control)", async () => {
    withResolver({ "cdn.example.com": [PUBLIC_ADDR] });
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const fetchSpy = stubFetch(zip);
    const bytes = await fetchPluginBundle("https://cdn.example.com/plugin.zip");
    expect(bytes).toEqual(zip);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // THE PLUGIN-SPECIFIC BOUND: the download is capped at 1 MiB (a plugin bundle is one small script + a tiny
  // manifest), so an over-cap body is refused at the WIRE — a decompression-bomb / slow-drip DoS bound before
  // parseBundle allocates. A bare fetch would happily buffer the whole 2 MiB.
  test("caps the download at 1 MiB — an over-cap body is refused (too-large)", async () => {
    withResolver({ "cdn.example.com": [PUBLIC_ADDR] });
    stubFetch(new Uint8Array(2 * 1024 * 1024)); // 2 MiB — double the plugin bundle cap
    await expect(fetchPluginBundle("https://cdn.example.com/huge.zip")).rejects.toBeInstanceOf(EgressBlockedError);
  });
});
