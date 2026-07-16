// entry/http/upload — the multipart ingest routes. Pins: both routes mount the belt chain
// [authCsrfGuard, bodyCap, handler]; the guard 401s the anonymous caller + 403s a cookie mutation missing
// the CSRF header (BEFORE the body is read); the asset route validates file + kind (400) and calls store
// with enforceMagic:true + a maxBytes cap; the import route delegates to run-profile-import (400 with no
// files; otherwise the per-card outcome). Hono isn't test-resolvable, so the registrars run over a captured
// mock app + context: the belt CHAIN is captured per route, business tests drive the final handler directly,
// and the guard is exercised on its own (its 401/403/next behavior is the CSRF pin).

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { AssetId, CharacterId, Handle, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { UploadAssetsPort, UploadDeps } from "@orb/server/entry/http";
import { registerUpload } from "@orb/server/entry/http";
import type { ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "@orb/server/entry/import";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const ASSET_ROUTE = "POST /api/assets/upload";
const IMPORT_ROUTE = "POST /api/import";
const CARD_JSON = '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tester","description":"A test character."}}';

interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly req: { readonly formData: () => Promise<FormData> };
}
type Handler = (c: MockCtx) => Promise<Response> | Response;

function makeCtx(principal: Principal | null, form: FormData): MockCtx {
  return {
    get: (key: string): Principal | null => (key === "principal" ? principal : null),
    json: (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    body: (data: string | Uint8Array | null, status = 200): Response => new Response(data, { status }),
    req: { formData: (): Promise<FormData> => Promise.resolve(form) },
  };
}

/** Capture the FULL belt chain each route mounts (`[authCsrfGuard, bodyCap, handler]`), not just one handler
 *  — the registrar now mounts middleware before the business handler. */
function uploadChains(deps: UploadDeps): Map<string, Handler[]> {
  const routes = new Map<string, Handler[]>();
  const app = {
    post: (path: string, ...handlers: Handler[]): unknown => {
      routes.set(`POST ${path}`, handlers);
      return app;
    },
  };
  registerUpload(app as unknown as Parameters<typeof registerUpload>[0], deps);
  return routes;
}

function chainFor(deps: UploadDeps, key: string): Handler[] {
  const chain = uploadChains(deps).get(key);
  if (chain === undefined) {
    throw new Error(`route not registered: ${key}`);
  }
  return chain;
}

/** The final business handler (last in the chain) — the business tests drive it with an already-authed ctx. */
function handlerFor(deps: UploadDeps, key: string): Handler {
  const handler = chainFor(deps, key).at(-1);
  if (handler === undefined) {
    throw new Error(`route has no handler: ${key}`);
  }
  return handler;
}

// ── The auth+CSRF guard (chain[0]) exercised on its own: a minimal middleware ctx with the principal + the
// request headers + a `next` spy. The guard short-circuits (401/403) or falls through to `next`. ───────────
interface GuardCtx {
  readonly get: (key: string) => Principal | null;
  readonly body: (data: null, status?: number) => Response;
  readonly req: { readonly raw: { readonly headers: Headers } };
}
type GuardMw = (c: GuardCtx, next: () => Promise<void>) => Promise<Response | undefined>;

function guardCtx(principal: Principal | null, headers?: Record<string, string>): GuardCtx {
  return {
    get: (key: string): Principal | null => (key === "principal" ? principal : null),
    body: (data: null, status = 200): Response => new Response(data, { status }),
    req: { raw: { headers: new Headers(headers) } },
  };
}

async function runGuard(deps: UploadDeps, key: string, ctx: GuardCtx): Promise<{ readonly status: number | null; readonly nexted: boolean }> {
  let nexted = false;
  // Narrowing the real Hono `Handler` (chain[0]) to the minimal middleware call-shape to run it on a stub ctx.
  // FABRICATION-OK: not a fabricated domain value — GuardMw is a test-local function type.
  const guard = chainFor(deps, key)[0] as unknown as GuardMw;
  const res = await guard(ctx, (): Promise<void> => {
    nexted = true;
    return Promise.resolve();
  });
  return { status: res instanceof Response ? res.status : null, nexted };
}

const COOKIE_OWNER: Principal = { ...OWNER, via: "cookie" };

const STORED: StoredAsset = {
  assetId: castId<AssetId>("ast_1"),
  hash: "h".repeat(64),
  size: 3,
  created: true,
};
const okAssets: UploadAssetsPort = { store: (): Promise<StoredAsset> => Promise.resolve(STORED) };

// A character port that always creates a fresh row (the import-route happy path). PD-108's handle-match
// edit-in-place is pinned in the run-profile-import + domain import-character suites; `update`/`findByHandle`
// are unused no-op stubs here (findByHandle always misses, so create always fires).
const creatingCharacter: ImportCharacterPort = {
  create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_1") }),
  update: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_1") }),
  findByImportHash: (): Promise<null> => Promise.resolve(null),
  findByHandle: (): Promise<null> => Promise.resolve(null),
};
// A no-op tag port (the card/pending carry behavior is proven in the run-profile-import suite).
const noopTag: ImportTagPort = {
  attachCardTagByName: (): Promise<boolean> => Promise.resolve(true),
};
// A no-op embedded-lorebook port (the W1 write is proven in the world-info + run-profile-import suites).
const noopWorldInfo: ImportWorldInfoPort = {
  importLorebook: () => Promise.resolve({ worldBookId: castId<WorldBookId>("wbk_0"), entryCount: 0, replaced: false }),
};
const okDeps: UploadDeps = {
  assets: okAssets,
  character: creatingCharacter,
  tag: noopTag,
  worldInfo: noopWorldInfo,
};

describe("registerUpload — asset upload", () => {
  test("anonymous → 401", async () => {
    const res = await handlerFor(okDeps, ASSET_ROUTE)(makeCtx(null, new FormData()));
    expect(res.status).toBe(401);
  });

  test("missing file → 400", async () => {
    const form = new FormData();
    form.append("kind", "avatar");
    const res = await handlerFor(okDeps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(400);
  });

  test("invalid kind → 400", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    form.append("kind", "not-a-kind");
    const res = await handlerFor(okDeps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(400);
  });

  test("valid upload → store(enforceMagic:true, kind, mime, maxBytes) → StoredAsset", async () => {
    const calls: {
      kind: string;
      mime: string;
      enforceMagic: boolean | undefined;
      maxBytes: number | undefined;
    }[] = [];
    const deps: UploadDeps = {
      assets: {
        store: (p: Parameters<UploadAssetsPort["store"]>[0]): Promise<StoredAsset> => {
          calls.push({
            kind: p.kind,
            mime: p.mime,
            enforceMagic: p.enforceMagic,
            maxBytes: p.maxBytes,
          });
          return Promise.resolve(STORED);
        },
      },
      character: creatingCharacter,
      tag: noopTag,
      worldInfo: noopWorldInfo,
    };
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    form.append("kind", "avatar");
    const res = await handlerFor(deps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STORED);
    expect(calls).toHaveLength(1);
    // PD-94: the route passes the store's maxBytes belt (64 MiB) alongside enforceMagic.
    expect(calls[0]).toEqual({
      kind: "avatar",
      mime: "image/png",
      enforceMagic: true,
      maxBytes: 64 * 1024 * 1024,
    });
  });
});

describe("registerUpload — import delegate", () => {
  test("anonymous → 401", async () => {
    const res = await handlerFor(okDeps, IMPORT_ROUTE)(makeCtx(null, new FormData()));
    expect(res.status).toBe(401);
  });

  test("no card files → 400", async () => {
    const res = await handlerFor(okDeps, IMPORT_ROUTE)(makeCtx(OWNER, new FormData()));
    expect(res.status).toBe(400);
  });

  test("card file → delegates to runProfileImport → imported result", async () => {
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode(CARD_JSON)], "Aria.json", { type: "application/json" }));
    const res = await handlerFor(okDeps, IMPORT_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    const result = (await res.json()) as { imported: unknown[]; failed: unknown[] };
    expect(result.imported).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });
});

describe("registerUpload — auth+CSRF guard (belt order, before the body is read)", () => {
  test("both routes mount [authCsrfGuard, bodyCap, handler] — auth runs BEFORE the body cap", () => {
    for (const key of [ASSET_ROUTE, IMPORT_ROUTE]) {
      expect(chainFor(okDeps, key)).toHaveLength(3);
    }
  });

  for (const key of [ASSET_ROUTE, IMPORT_ROUTE]) {
    test(`${key}: anonymous → 401, never reaches next (no body buffered)`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(null));
      expect(status).toBe(401);
      expect(nexted).toBe(false);
    });

    test(`${key}: cookie session WITHOUT the CSRF header → 403`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(COOKIE_OWNER));
      expect(status).toBe(403);
      expect(nexted).toBe(false);
    });

    test(`${key}: cookie session WITH the CSRF header → passes to the body cap`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(COOKIE_OWNER, { [CSRF_HEADER]: "1" }));
      expect(status).toBeNull();
      expect(nexted).toBe(true);
    });

    test(`${key}: non-cookie principal (fallback) is not CSRF-eligible → passes with no header`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(OWNER));
      expect(status).toBeNull();
      expect(nexted).toBe(true);
    });
  }
});
