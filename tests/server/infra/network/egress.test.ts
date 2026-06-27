import {
  DEFAULT_TRUSTED_RANGES,
  privateEgressRanges,
  safeFetch,
  shouldBlockEgress,
} from "@orb/server/infra/network";
import { describe, expect, test, vi } from "vitest";

const ranges = DEFAULT_TRUSTED_RANGES;
const allow = (...hosts: string[]): ReadonlySet<string> => new Set(hosts);

describe("shouldBlockEgress", () => {
  test("blocks a private resolved address for a non-allowlisted host", () => {
    expect(shouldBlockEgress("127.0.0.1", "evil.example", allow(), ranges)).toBe(true);
  });

  test("allows a private address when its host is allowlisted", () => {
    expect(shouldBlockEgress("10.0.0.5", "authentik.lan", allow("authentik.lan"), ranges)).toBe(
      false,
    );
  });

  test("the allowlist host match is case-insensitive", () => {
    expect(shouldBlockEgress("10.0.0.5", "Authentik.LAN", allow("authentik.lan"), ranges)).toBe(
      false,
    );
  });

  test("never blocks a public resolved address", () => {
    expect(shouldBlockEgress("8.8.8.8", "openrouter.ai", allow(), ranges)).toBe(false);
  });

  test("honors an operator-declared extra private range (TRUSTED_PRIVATE_RANGES shape)", () => {
    const extended = [...DEFAULT_TRUSTED_RANGES, "203.0.113.0/24"];
    const host = "internal.example";
    expect(shouldBlockEgress("203.0.113.9", host, allow(), extended)).toBe(true);
    // The same public-looking address is allowed when the extra range is NOT configured.
    expect(shouldBlockEgress("203.0.113.9", host, allow(), DEFAULT_TRUSTED_RANGES)).toBe(false);
  });
});

describe("privateEgressRanges", () => {
  test("includes every built-in trusted range by default", () => {
    const r = privateEgressRanges();
    for (const range of DEFAULT_TRUSTED_RANGES) {
      expect(r).toContain(range);
    }
  });
});

describe("safeFetch (staged response-side controls)", () => {
  test("rejects a disallowed content-type", async () => {
    vi.stubGlobal(
      "fetch",
      () => new Response("hi", { status: 200, headers: { "content-type": "text/html" } }),
    );
    await expect(
      safeFetch("https://example.com", { allowedContentTypes: ["image/png"] }),
    ).rejects.toThrow("content-type");
  });

  test("enforces the maxBytes cap when reading the body", async () => {
    const big = "x".repeat(1000);
    vi.stubGlobal(
      "fetch",
      () => new Response(big, { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const res = await safeFetch("https://example.com", { maxBytes: 100 });
    await expect(res.bytes()).rejects.toThrow("maxBytes");
  });

  test("returns the body bytes when under the cap", async () => {
    vi.stubGlobal(
      "fetch",
      () => new Response("hello", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const res = await safeFetch("https://example.com");
    expect(new TextDecoder().decode(await res.bytes())).toBe("hello");
  });

  test("caps the redirect chain and returns the terminal 3xx for inspection", async () => {
    vi.stubGlobal("fetch", () => Response.redirect("https://example.com/next", 302));
    const res = await safeFetch("https://example.com", { maxRedirects: 1 });
    expect(res.status).toBe(302);
  });
});
