// infra/network/gif-search — the Tenor adapter. Pins the SECURITY-load-bearing behavior:
//   • searchTenorGifs — the response mapping golden (+ cursor passthrough), malformed rows skipped, non-2xx
//     throws. The key rides a query param — never surfaced.
//   • fetchTenorGifImage — FAIL-CLOSED via safeFetch's `.tenor.com` allowlist: a non-Tenor / non-https /
//     lookalike / IP-literal host is rejected BEFORE any fetch (safeFetch validates before dialing); a
//     200-status HTML page served as image/gif is rejected by the magic-byte guard (never trusting the
//     Content-Type); a real gif on a Tenor host passes and returns the sniffed mime.
// safeFetch resolves the host before dialing, so a valid-host test injects a fixed PUBLIC resolver (no
// live DNS); host-REJECTION cases block before resolve/fetch (asserted via the untouched fetch spy).

import { __setEgressResolverForTest, fetchTenorGifImage, searchTenorGifs } from "@orb/server/infra/network";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const BYTE = 256;
const PUBLIC_ADDR = "93.184.216.34";

beforeEach(() => {
  __setEgressResolverForTest(() => Promise.resolve([PUBLIC_ADDR]));
});
afterEach(() => {
  __setEgressResolverForTest(null);
});

/** A minimal valid GIF89a: signature + logical-screen-descriptor dims (bytes 6..9, little-endian). Dims are
 *  kept < 256 so the high byte is 0 (no bitwise ops — noBitwiseOperators). */
function gifBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(13);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  b[6] = width % BYTE;
  b[7] = Math.floor(width / BYTE);
  b[8] = height % BYTE;
  b[9] = Math.floor(height / BYTE);
  return b;
}

interface TenorFormat {
  readonly url: string;
  readonly dims: readonly number[];
}

/** Build one Tenor result row — the snake_case wire key is Tenor's, not ours. */
function tenorResult(id: string, formats: Record<string, TenorFormat>): Record<string, unknown> {
  // biome-ignore lint/style/useNamingConvention: Tenor v2 API wire field (snake_case) — the external response shape.
  return { id, media_formats: formats };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// The `.tenor.com` allowlist is now safeFetch data (HB-A) — exercised THROUGH fetchTenorGifImage, which
// rejects a bad host before any socket (the fetch spy stays untouched). Real Tenor media subdomains pass.
describe("fetchTenorGifImage host allowlist (the SSRF barrier, now safeFetch's `.tenor.com` data)", () => {
  for (const host of ["media.tenor.com", "c.tenor.com", "media1.tenor.com", "MEDIA.TENOR.COM"]) {
    test(`accepts a real Tenor media host (${host})`, async () => {
      vi.stubGlobal("fetch", () => new Response(gifBytes(10, 10), { status: 200, headers: { "content-type": "image/gif" } }));
      const out = await fetchTenorGifImage(`https://${host}/x.gif`);
      expect(out.image.mime).toBe("image/gif");
    });
  }

  for (const host of ["eviltenor.com", "tenor.com.evil.net", "media.tenor.com.evil.net", "nottenor.com", "tenor.com", "127.0.0.1", "[::1]"]) {
    test(`rejects a lookalike / suffix-spoof / apex / IP-literal (${host}) BEFORE any fetch`, async () => {
      const fetchSpy = vi.fn(() => new Response(gifBytes(10, 10), { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      await expect(fetchTenorGifImage(`https://${host}/x.gif`)).rejects.toMatchObject({ name: "EgressBlockedError" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});

describe("searchTenorGifs", () => {
  test("maps a Tenor response to normalized hits (+ cursor passthrough), skipping malformed rows", async () => {
    vi.stubGlobal("fetch", () =>
      jsonResponse({
        results: [
          tenorResult("gif1", {
            gif: { url: "https://media.tenor.com/full1.gif", dims: [498, 280] },
            tinygif: { url: "https://media.tenor.com/tiny1.gif", dims: [220, 124] },
          }),
          // no tinygif → preview falls back to the full format
          tenorResult("gif2", {
            mediumgif: { url: "https://media.tenor.com/full2.gif", dims: [300, 300] },
          }),
          tenorResult("bad", {}), // no usable format → skipped
        ],
        next: "cursor-token",
      }),
    );
    const result = await searchTenorGifs({ apiKey: "k", query: "cat", limit: 20 });
    expect(result.hits).toEqual([
      {
        id: "gif1",
        previewUrl: "https://media.tenor.com/tiny1.gif",
        fullUrl: "https://media.tenor.com/full1.gif",
        width: 498,
        height: 280,
      },
      {
        id: "gif2",
        previewUrl: "https://media.tenor.com/full2.gif",
        fullUrl: "https://media.tenor.com/full2.gif",
        width: 300,
        height: 300,
      },
    ]);
    expect(result.nextCursor).toBe("cursor-token");
  });

  test("throws on a non-2xx upstream (mapped to hub-unavailable by the verb)", async () => {
    vi.stubGlobal("fetch", () => new Response("nope", { status: 429, headers: { "content-type": "application/json" } }));
    await expect(searchTenorGifs({ apiKey: "k", query: "cat", limit: 20 })).rejects.toThrow();
  });
});

describe("fetchTenorGifImage (SSRF + untrusted-image chokepoint)", () => {
  test("rejects a non-Tenor host BEFORE any fetch (fail-closed SSRF)", async () => {
    const fetchSpy = vi.fn(() => new Response(gifBytes(10, 10), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchTenorGifImage("https://evil.example.com/x.gif")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("rejects a non-https Tenor URL before any fetch", async () => {
    const fetchSpy = vi.fn(() => new Response(gifBytes(10, 10), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchTenorGifImage("http://media.tenor.com/x.gif")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("rejects a 200 HTML page served as image/gif (magic bytes, not the Content-Type)", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        new Response(new TextEncoder().encode("<!doctype html><html>error</html>"), {
          status: 200,
          headers: { "content-type": "image/gif" },
        }),
    );
    await expect(fetchTenorGifImage("https://media.tenor.com/x.gif")).rejects.toThrow();
  });

  test("accepts a real gif on a Tenor host → returns bytes + sniffed mime", async () => {
    const bytes = gifBytes(100, 80);
    vi.stubGlobal("fetch", () => new Response(bytes, { status: 200, headers: { "content-type": "image/gif" } }));
    const out = await fetchTenorGifImage("https://media.tenor.com/real.gif");
    expect(out.image.mime).toBe("image/gif");
    expect(out.bytes.byteLength).toBe(bytes.byteLength);
  });
});
