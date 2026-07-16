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
import { expect, test } from "../../../support/fixtures";

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
    body: (data: string | Uint8Array | null, status = 200): Response => new Response(data, { status }),
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
  registerBlob(app as unknown as Parameters<typeof registerBlob>[0], deps);
  const handler = routes.get(ROUTE);
  if (handler === undefined) {
    throw new Error("blob route not registered");
  }
  return handler;
}

const PNG_META: { mime: string; size: number } = { mime: "image/png", size: 3 };
const ORIGINAL = new Uint8Array([1, 2, 3]);
const WEBP = new Uint8Array([9, 9]);

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
});
