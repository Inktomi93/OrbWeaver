import {
  DEFAULT_TRUSTED_RANGES,
  fetchImageBytes,
  privateEgressRanges,
  safeFetch,
  shouldBlockEgress,
} from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const ranges = DEFAULT_TRUSTED_RANGES;
const allow = (...hosts: string[]): ReadonlySet<string> => new Set(hosts);
const ABORT_RE = /abort/i;

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

  test("with no TRUSTED_PRIVATE_RANGES set (the runner env) it is EXACTLY the built-in set — no extras leak in", () => {
    // The empty-CSV branch: `env.TRUSTED_PRIVATE_RANGES` is unset under the runner, so split/trim/filter
    // yields [] and the function returns DEFAULT_TRUSTED_RANGES verbatim (no accidental empty-string range,
    // which would make isInRanges match everything). NB: the TRIM/case/extra-CIDR branch and the
    // installEgressFirewall OIDC-issuer carve-out + EGRESS_ALLOWLIST CSV parse read the FROZEN
    // `foundation/env` (parsed once at import; vi.stubEnv cannot mutate it) — the extra-range merge is
    // covered by the shouldBlockEgress "operator-declared extra range" case above via a direct `ranges` arg.
    expect([...privateEgressRanges()]).toEqual([...DEFAULT_TRUSTED_RANGES]);
  });
});

// Multi-chunk streaming body: readCapped (internal) is exercised through safeFetch's bytes() reader. The
// existing single-body over-cap test proves the cap; these prove the AT-CAP boundary passes and a
// cap-CROSSING chunk (the total tips over mid-stream, on a chunk that individually fits) rejects — the
// decompression-bomb path where no single chunk is oversized but the accumulation is.
function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      const chunk = chunks[i];
      if (chunk !== undefined) {
        controller.enqueue(chunk);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe("safeFetch readCapped — multi-chunk cap boundary", () => {
  test("a body EXACTLY at maxBytes across several chunks passes (at-cap is not a crossing)", async () => {
    const chunks = [new Uint8Array(40), new Uint8Array(40), new Uint8Array(20)]; // 100 total
    vi.stubGlobal(
      "fetch",
      () =>
        new Response(streamOf(chunks), { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const res = await safeFetch("https://example.com", { maxBytes: 100 });
    expect((await res.bytes()).byteLength).toBe(100);
    vi.unstubAllGlobals();
  });

  test("the chunk that tips the total past maxBytes rejects (each chunk fits; the accumulation does not)", async () => {
    const chunks = [new Uint8Array(40), new Uint8Array(40), new Uint8Array(40)]; // 120 > cap on chunk 3
    vi.stubGlobal(
      "fetch",
      () =>
        new Response(streamOf(chunks), { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const res = await safeFetch("https://example.com", { maxBytes: 100 });
    await expect(res.bytes()).rejects.toThrow("maxBytes");
    vi.unstubAllGlobals();
  });
});

describe("safeFetch — abort propagation mid-redirect-chain", () => {
  test("an AbortSignal that fires during the chain surfaces as a rejection (the caller's timeout/cancel wins)", async () => {
    // followRedirects forwards `options.signal` on EVERY hop. If the signal aborts between hops, the next
    // fetch must reject with the abort — the caller's timeout/cancel propagates through the manual chain
    // rather than being swallowed. hop0 302s to a second origin; the signal is aborted before hop1 fires.
    const ctrl = new AbortController();
    let hop = 0;
    vi.stubGlobal("fetch", (u: URL | string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }
      hop += 1;
      if (hop === 1) {
        ctrl.abort(); // abort AFTER the first hop resolves, BEFORE the redirect follow
        return Promise.resolve(Response.redirect(`${String(u)}/next`, 302));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    await expect(
      safeFetch("https://benign.test/start", { signal: ctrl.signal, maxRedirects: 2 }),
    ).rejects.toThrow(ABORT_RE);
    vi.unstubAllGlobals();
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

// The imagery generated-image download — safeFetch's first consumer (D61 B5a). The provider-returned
// image URL is response-controlled (an OpenRouter-marketplace model provider populates it), so it is
// attacker-influenceable; fetchImageBytes must fail CLOSED (drop → null, never a raw fetch).
describe("fetchImageBytes (SSRF-safe generated-image download)", () => {
  test("returns the body bytes for a 2xx image response", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal(
      "fetch",
      () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const bytes = await fetchImageBytes("https://cdn.example/img.png");
    expect(bytes).not.toBeNull();
    expect([...(bytes ?? [])]).toEqual([...png]);
  });

  test("drops a non-2xx response (null — never a partial/error body stored)", async () => {
    vi.stubGlobal("fetch", () => new Response("nope", { status: 404 }));
    expect(await fetchImageBytes("https://cdn.example/missing.png")).toBeNull();
  });

  test("drops an SSRF-blocked internal URL (the firewall dispatcher rejects the connect) → null", async () => {
    // This is exactly what the global egress dispatcher does to a loopback/link-local/RFC1918 target:
    // it rejects the connect at DNS resolution (see the shouldBlockEgress tests above). fetchImageBytes
    // must swallow that rejection and DROP the image — the SSRF response never reaches an asset.
    vi.stubGlobal("fetch", () =>
      Promise.reject(new Error("SSRF_BLOCKED: 169.254.169.254 → 169.254.169.254")),
    );
    expect(await fetchImageBytes("http://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  test("drops an oversized response that trips the safeFetch byte cap → null", async () => {
    // A ~6 MB body exceeds safeFetch's 5 MB decompression-bomb cap; bytes() throws → fetchImageBytes drops.
    const huge = new Uint8Array(6_000_000);
    vi.stubGlobal(
      "fetch",
      () => new Response(huge, { status: 200, headers: { "content-type": "image/png" } }),
    );
    expect(await fetchImageBytes("https://cdn.example/bomb.png")).toBeNull();
  });

  test("the maxBytes param threads to the safeFetch cap: a lowered cap drops an over-cap image", async () => {
    // The compose binding passes AppSettings.maxImageBytes here. A 1 KB image under safeFetch's 5 MB
    // default succeeds, but a 500-byte cap drops it — proving the knob reaches the byte cap.
    const img = new Uint8Array(1000);
    vi.stubGlobal(
      "fetch",
      () => new Response(img, { status: 200, headers: { "content-type": "image/png" } }),
    );
    expect(await fetchImageBytes("https://cdn.example/img.png", 500)).toBeNull();
  });

  test("the maxBytes param admits an image within a raised cap", async () => {
    // A ~6 MB image that would trip the default 5 MB cap is admitted when the knob raises it to 8 MB.
    const big = new Uint8Array(6_000_000);
    vi.stubGlobal(
      "fetch",
      () => new Response(big, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const bytes = await fetchImageBytes("https://cdn.example/hi-res.png", 8_000_000);
    expect(bytes).not.toBeNull();
    expect(bytes?.byteLength).toBe(6_000_000);
  });
});
