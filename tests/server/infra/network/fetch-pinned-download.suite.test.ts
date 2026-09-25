// fetchPinnedDownload — the share relay's cloudflared download. It is safeFetch over the pin's exact
// `downloadHosts`, so what this suite pins is that the door ROUTES THROUGH that guard (a bare fetch passes none of
// the refusals below), that it follows the release host's one redirect to the asset host the pin names, and that
// the pinned size caps the bytes. The full SSRF matrix is `safefetch-selfenforcing.suite.test.ts`. Injected
// resolver + stubbed transport: no live DNS, no live network.

import { __setEgressResolverForTest, EgressBlockedError, fetchPinnedDownload } from "@orb/server/infra/network";
import { CLOUDFLARED_PIN } from "@orb/server/infra/relay";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const PUBLIC_ADDR = "140.82.112.3";
const RELEASE_URL = `${CLOUDFLARED_PIN.releaseBase}/${CLOUDFLARED_PIN.version}/cloudflared-linux-amd64`;
const ASSET_URL = "https://release-assets.githubusercontent.com/github-production-release-asset/1/asset";
const ASSET = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);
const DEADLINE_MS = 5000;
const NOT_FOUND = 404;
const REDIRECT = 302;

function limits(maxBytes = ASSET.byteLength): { readonly allowedHosts: readonly string[]; readonly maxBytes: number; readonly deadlineMs: number } {
  return { allowedHosts: CLOUDFLARED_PIN.downloadHosts, maxBytes, deadlineMs: DEADLINE_MS };
}

function withResolver(map: Readonly<Record<string, readonly string[]>> = {}): void {
  __setEgressResolverForTest((host) => Promise.resolve(map[host] ?? [PUBLIC_ADDR]));
}

// The release host answers with a redirect to `location`; every other URL answers the asset bytes.
function stubRelease(location: string, asset: Uint8Array = ASSET): ReturnType<typeof vi.fn> {
  const spy = vi.fn((url: string | URL) =>
    String(url) === RELEASE_URL ? Response.redirect(location, REDIRECT) : new Response(new Blob([new Uint8Array(asset)]), { status: 200 }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("fetchPinnedDownload routes the relay download through the SSRF guard", () => {
  afterEach(() => {
    __setEgressResolverForTest(null);
    vi.unstubAllGlobals();
  });

  test("control: the release host's redirect to the pinned asset host returns the asset bytes", async () => {
    withResolver();
    const fetchSpy = stubRelease(ASSET_URL);
    const res = await fetchPinnedDownload(RELEASE_URL, limits());
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ASSET);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("a redirect to a host the pin does not name is refused on the new URL", async () => {
    withResolver();
    stubRelease("https://objects.example.com/asset");
    await expect(fetchPinnedDownload(RELEASE_URL, limits())).rejects.toMatchObject({ reason: "host-not-allowed" });
  });

  test("a start URL off the pinned hosts is refused before any socket", async () => {
    withResolver();
    const fetchSpy = stubRelease(ASSET_URL);
    await expect(fetchPinnedDownload("https://mirror.example.com/cloudflared", limits())).rejects.toMatchObject({ reason: "host-not-allowed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a pinned host that resolves to a private address is refused before any socket", async () => {
    withResolver({ "github.com": ["10.0.0.5"] });
    const fetchSpy = stubRelease(ASSET_URL);
    await expect(fetchPinnedDownload(RELEASE_URL, limits())).rejects.toMatchObject({ reason: "private-address" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("an answer longer than the pinned size is refused at the wire", async () => {
    withResolver();
    stubRelease(ASSET_URL, new Uint8Array(ASSET.byteLength * 2));
    await expect(fetchPinnedDownload(RELEASE_URL, limits())).rejects.toBeInstanceOf(EgressBlockedError);
  });

  // The asset is up to ~55 MB. The caller streams it into the hash and the partial file, so the door must hand the
  // body through, not buffer it: an upstream that is only read on demand shows how much the door read before answering.
  describe("the body streams through the door", () => {
    const chunkCount = 8;
    const whole = Uint8Array.from({ length: chunkCount }, (_, index) => index + 1);

    /** An upstream body read one byte per pull, and only when someone reads it. */
    function onDemandAsset(): { readonly stream: ReadableStream<Uint8Array>; readonly pulled: () => number; readonly cancelled: () => boolean } {
      let pulled = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>(
        {
          cancel(): void {
            cancelled = true;
          },
          pull(controller): void {
            pulled += 1;
            if (pulled > chunkCount) {
              controller.close();
              return;
            }
            controller.enqueue(Uint8Array.of(pulled));
          },
        },
        { highWaterMark: 0 },
      );
      return { stream, pulled: (): number => pulled, cancelled: (): boolean => cancelled };
    }

    function stubStreamingRelease(stream: ReadableStream<Uint8Array>): void {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string | URL) => (String(url) === RELEASE_URL ? Response.redirect(ASSET_URL, REDIRECT) : new Response(stream, { status: 200 }))),
      );
    }

    test("the door answers after reading at most one chunk, and the caller still reads every byte", async () => {
      withResolver();
      const asset = onDemandAsset();
      stubStreamingRelease(asset.stream);
      const res = await fetchPinnedDownload(RELEASE_URL, limits(chunkCount));
      expect(asset.pulled()).toBeLessThanOrEqual(1);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(whole);
    });

    // A caller that stops reading (a disk error, a refused chunk) cancels the body; the cancel must reach the upstream
    // read the door holds, or the pinned connection stays open until the deadline.
    test.each([
      ["before reading anything", 0],
      ["after reading part of it", 2],
    ])("a caller that abandons the body %s cancels the upstream read", async (_label, reads) => {
      withResolver();
      const asset = onDemandAsset();
      stubStreamingRelease(asset.stream);
      const res = await fetchPinnedDownload(RELEASE_URL, limits(chunkCount));
      const reader = res.body?.getReader();
      for (let read = 0; read < reads; read += 1) {
        await reader?.read();
      }
      await reader?.cancel();
      await vi.waitFor(() => expect(asset.cancelled()).toBe(true));
    });

    test("an answer that passes the pinned size after the first chunk errors the body at the wire", async () => {
      withResolver();
      const asset = onDemandAsset();
      stubStreamingRelease(asset.stream);
      const res = await fetchPinnedDownload(RELEASE_URL, limits(chunkCount / 2));
      await expect(res.arrayBuffer()).rejects.toBeInstanceOf(Error);
      expect(asset.pulled()).toBeLessThanOrEqual(chunkCount / 2 + 1);
    });
  });

  test("a non-2xx answer keeps its status and carries no body", async () => {
    withResolver();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("missing", { status: NOT_FOUND })),
    );
    const res = await fetchPinnedDownload(RELEASE_URL, limits());
    expect(res.status).toBe(NOT_FOUND);
    expect(res.body).toBeNull();
  });
});
