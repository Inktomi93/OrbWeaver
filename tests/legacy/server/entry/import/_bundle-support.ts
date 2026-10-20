import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { principal as makePrincipal } from "@orb/testkit/node/factories/principal.ts";
import type { ExportDeps, ImportBundleDeps } from "#server/entry/http/index.ts";
import { registerExport, registerImportBundle } from "#server/entry/http/index.ts";

/** The importing owner's Principal; owner is written onto the row before it resolves. */
export async function principalOf(db: Db, userId: UserId): Promise<Principal> {
  return await makePrincipal({ db }, userId, { role: "owner" });
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
  registerImportBundle(mockApp as unknown as Parameters<typeof registerImportBundle>[0], deps);
  const handler = routes.get("/api/import/bundle");
  if (handler === undefined) {
    throw new Error("bundle route not registered");
  }
  return handler;
}
