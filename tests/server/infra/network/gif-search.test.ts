// infra/network/gif-search — the Tenor adapter. Pins the SECURITY-load-bearing behavior:
//   • isTenorMediaHost — the SSRF host allowlist: real Tenor hosts pass, lookalikes/IP-literals/subdomain-
//     suffix-spoofs are rejected.
//   • searchTenorGifs — the response mapping golden (+ cursor passthrough), malformed rows skipped, non-2xx
//     throws. The key rides a query param — never surfaced.
//   • fetchTenorGifImage — FAIL-CLOSED: a non-Tenor / non-https host is rejected BEFORE any fetch; a
//     200-status HTML page served as image/gif is rejected by the magic-byte guard (never trusting the
//     Content-Type); a real gif passes and returns the sniffed mime.

import { fetchTenorGifImage, isTenorMediaHost, searchTenorGifs } from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const BYTE = 256;

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

describe("isTenorMediaHost (the SSRF host allowlist)", () => {
  test("accepts real Tenor media hosts + the apex", () => {
    expect(isTenorMediaHost("media.tenor.com")).toBe(true);
    expect(isTenorMediaHost("c.tenor.com")).toBe(true);
    expect(isTenorMediaHost("media1.tenor.com")).toBe(true);
    expect(isTenorMediaHost("MEDIA.TENOR.COM")).toBe(true); // case-insensitive
    expect(isTenorMediaHost("tenor.com")).toBe(true);
  });

  test("rejects lookalikes, suffix-spoofs, and IP literals", () => {
    expect(isTenorMediaHost("eviltenor.com")).toBe(false);
    expect(isTenorMediaHost("tenor.com.evil.net")).toBe(false);
    expect(isTenorMediaHost("media.tenor.com.evil.net")).toBe(false);
    expect(isTenorMediaHost("nottenor.com")).toBe(false);
    expect(isTenorMediaHost("169.254.169.254")).toBe(false);
    expect(isTenorMediaHost("127.0.0.1")).toBe(false);
  });
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
    vi.stubGlobal(
      "fetch",
      () => new Response("nope", { status: 429, headers: { "content-type": "application/json" } }),
    );
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
    vi.stubGlobal(
      "fetch",
      () => new Response(bytes, { status: 200, headers: { "content-type": "image/gif" } }),
    );
    const out = await fetchTenorGifImage("https://media.tenor.com/real.gif");
    expect(out.image.mime).toBe("image/gif");
    expect(out.bytes.byteLength).toBe(bytes.byteLength);
  });
});
