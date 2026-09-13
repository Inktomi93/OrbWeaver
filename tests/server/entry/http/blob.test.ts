// entry/http/blob — the owner-gated blob-serve route. Pins: anonymous → 401; an unowned/missing hash →
// 404 (getMetadata is the gate); a served original carries the stored mime + `private, immutable`; the
// `?w=` variant serves webp; an off-ladder/invalid width → 404; a torn blob (row present, bytes gone) → 404.
// Hono isn't test-resolvable (not hoisted), so the registrar runs over a captured mock app + context
// (same pattern as the debug-routes gate test).

import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { BlobAssetsPort, BlobCasPort, BlobDeps } from "@orb/server/entry/http";
import { registerBlob } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const HASH = "a".repeat(64);
const ROUTE = "GET /api/blob/:hash";

interface MockReq {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
}
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly req: {
    readonly param: (name: string) => string;
    readonly query: (name: string) => string | undefined;
  };
}
type Handler = (c: MockCtx) => Promise<Response> | Response;

function makeCtx(principal: Principal | null, req: MockReq): MockCtx {
  return {
    get: (key: string): Principal | null => (key === "principal" ? principal : null),
    body: (data: string | Uint8Array | null, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: {
      param: (name: string): string => req.params?.[name] ?? "",
      query: (name: string): string | undefined => req.query?.[name],
    },
  };
}

function blobHandler(deps: BlobDeps): Handler {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  // @orb-waive no-test-fabrication(unknown): minimal route-capture mock; the real framework app type is far larger than what route REGISTRATION exercises here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerBlob(app as unknown as Parameters<typeof registerBlob>[0], deps);
  const handler = routes.get(ROUTE);
  if (handler === undefined) {
    throw new Error("blob route not registered");
  }
  return handler;
}

const PNG_META: { mime: string; size: number } = { mime: "image/png", size: 3 };
const ORIGINAL = new Uint8Array([1, 2, 3]);
// Real magic bytes so the serve boundary stamps the ACTUAL served format, not a blanket webp: a re-encoded
// variant IS webp (RIFF….WEBP), but the animated passthrough (resolve-variant serves gif/apng verbatim —
// sharp's webp encoder drops animation) must keep its own type or an animated gif serves as a still webp.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]); // "GIF89a" + a minimal header
const APNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature (apng sniffs as image/png)

describe("registerBlob", () => {
  test("anonymous caller → 401, no body", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.reject(new Error("no")) };
    const res = await blobHandler({ assets, cas })(makeCtx(null, { params: { hash: HASH } }));
    expect(res.status).toBe(401);
  });

  test("unowned / missing hash → 404 (getMetadata is the gate)", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH } }));
    expect(res.status).toBe(404);
  });

  test("owned original → 200 with stored mime + private/immutable cache + the bytes", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(PNG_META),
      resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ORIGINAL);
  });

  test("?w= variant → 200 webp via resolveVariant (cas NOT read)", async () => {
    let casRead = false;
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<Uint8Array> => Promise.resolve(WEBP),
    };
    const cas: BlobCasPort = {
      read: (): Promise<Uint8Array> => {
        casRead = true;
        return Promise.resolve(ORIGINAL);
      },
    };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "96", f: "webp" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WEBP);
    expect(casRead).toBe(false);
  });

  // C12: the animated passthrough. `resolveVariant` serves an animated gif/apng original VERBATIM (sharp's
  // webp encoder drops animation), so the serve boundary must stamp the bytes' REAL type — a blanket
  // `image/webp` mislabels an animated gif as a still webp and a strict decoder rejects it.
  test("?w= gif passthrough → 200 with image/gif (not a blanket webp)", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<Uint8Array> => Promise.resolve(GIF),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "96" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(GIF);
  });

  test("?w= apng passthrough → 200 with image/png (the codec models apng under the PNG signature)", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<Uint8Array> => Promise.resolve(APNG),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "96" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  test("off-ladder width (resolveVariant → undefined) → 404", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(PNG_META),
      resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "7777" } }));
    expect(res.status).toBe(404);
  });

  test("invalid width → 404 without calling resolveVariant", async () => {
    let resolveCalled = false;
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(PNG_META),
      resolveVariant: (): Promise<undefined> => {
        resolveCalled = true;
        return Promise.resolve(undefined);
      },
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "abc" } }));
    expect(res.status).toBe(404);
    expect(resolveCalled).toBe(false);
  });

  test("torn blob (metadata present, bytes gone) → 404", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(PNG_META),
      resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const cas: BlobCasPort = {
      read: (): Promise<Uint8Array> => Promise.reject(new Error("ENOENT")),
    };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH } }));
    expect(res.status).toBe(404);
  });

  test("?w= decode failure (valid magic bytes, corrupt body) → falls back to the unresized original, never a 500", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(PNG_META),
      resolveVariant: (): Promise<Uint8Array> => Promise.reject(new Error("pngload_buffer: libspng read error")),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "96" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ORIGINAL);
  });

  test("?w= decode failure with no fallback original available (metadata missing) → 404, never a 500", async () => {
    const assets: BlobAssetsPort = {
      getMetadata: (): Promise<undefined> => Promise.resolve(undefined),
      resolveVariant: (): Promise<Uint8Array> => Promise.reject(new Error("pngload_buffer: libspng read error")),
    };
    const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
    const res = await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH }, query: { w: "96" } }));
    expect(res.status).toBe(404);
  });

  // #709 (stored-XSS): a client-controlled asset mime is served same-origin. The app CSP's `script-src 'self'`
  // permits a same-origin `<script src=/api/blob/…>` chain and nosniff does not help (text/javascript is a real
  // script type), so an HTML/JS/SVG blob navigated-to or chained would execute with the owner's cookies. The
  // serve route neutralizes any non-passive-media type to a downloaded octet-stream so it can NEVER render as
  // an active same-origin document/script — regardless of how the bytes were stored.
  describe("#709 serve-boundary neutralization", () => {
    async function serve(mime: string): Promise<Response> {
      const meta: { mime: string; size: number } = { mime, size: ORIGINAL.length };
      const assets: BlobAssetsPort = {
        getMetadata: (): Promise<{ mime: string; size: number }> => Promise.resolve(meta),
        resolveVariant: (): Promise<undefined> => Promise.resolve(undefined),
      };
      const cas: BlobCasPort = { read: (): Promise<Uint8Array> => Promise.resolve(ORIGINAL) };
      return await blobHandler({ assets, cas })(makeCtx(OWNER, { params: { hash: HASH } }));
    }

    for (const active of ["text/javascript", "text/html", "image/svg+xml", "application/xhtml+xml", "application/pdf", "text/plain"]) {
      test(`${active} is served neutralized (octet-stream + attachment), never as its executable/document type`, async () => {
        const res = await serve(active);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/octet-stream");
        expect(res.headers.get("content-type")).not.toBe(active);
        expect(res.headers.get("content-disposition")).toBe("attachment");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        // the bytes still arrive — a download, not a rejection
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(ORIGINAL);
      });
    }

    for (const media of ["image/png", "image/webp", "image/gif", "image/apng", "video/mp4", "video/webm", "audio/mpeg"]) {
      test(`${media} still serves INLINE with its real type (no regression to the gallery/lightbox/backgrounds)`, async () => {
        const res = await serve(media);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe(media);
        expect(res.headers.get("content-disposition")).toBeNull();
      });
    }
  });
});
