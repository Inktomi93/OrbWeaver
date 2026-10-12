import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ExportDeps, ImportBundleDeps } from "@orb/server/entry/http";
import { registerExport, registerImportBundle } from "@orb/server/entry/http";

export function principalOf(userId: UserId): Principal {
  return { userId, role: "owner", handle: castId<Handle>(userId), externalId: null, via: "header" };
}

// ── The minimal Hono-shape mock the registrars capture onto (same pattern as the route tests). ────────────
type Handler = (c: MockCtx) => Promise<Response> | Response;
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly req: { readonly query: (name: string) => string | undefined; readonly raw: Request };
}
export function makeCtx(principal: Principal | null, raw?: Request): MockCtx {
  return {
    get: (key): Principal | null => (key === "principal" ? principal : null),
    json: (b, status = 200): Response => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }),
    body: (data, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: {
      query: (): string | undefined => undefined,
      raw: raw ?? new Request("http://t/", { method: "POST" }),
    },
  };
}
export function libraryHandler(deps: ExportDeps): Handler {
  const routes = new Map<string, Handler>();
  const mockApp = {
    get: (path: string, fn: Handler): unknown => {
      routes.set(path, fn);
      return mockApp;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerExport(mockApp as unknown as Parameters<typeof registerExport>[0], deps);
  const handler = routes.get("/api/export/library");
  if (handler === undefined) {
    throw new Error("library route not registered");
  }
  return handler;
}
export function bundleHandler(deps: ImportBundleDeps): Handler {
  const routes = new Map<string, Handler>();
  const mockApp = {
    post: (path: string, fn: Handler): unknown => {
      routes.set(path, fn);
      return mockApp;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerImportBundle(mockApp as unknown as Parameters<typeof registerImportBundle>[0], deps);
  const handler = routes.get("/api/import/bundle");
  if (handler === undefined) {
    throw new Error("bundle route not registered");
  }
  return handler;
}
