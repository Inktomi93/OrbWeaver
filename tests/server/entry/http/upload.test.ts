// entry/http/upload — the multipart ingest routes. Pins: both routes require a principal (401 anonymous);
// the asset route validates file + kind (400) and calls store with enforceMagic:true; the import route
// delegates to run-profile-import (400 with no files; otherwise the per-card outcome). Hono isn't
// test-resolvable, so the registrars run over a captured mock app + context.

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { UploadAssetsPort, UploadDeps } from "@orb/server/entry/http";
import { registerUpload } from "@orb/server/entry/http";
import type { ImportCharacterPort, ImportTagPort } from "@orb/server/entry/import";
import { describe, expect, test } from "vitest";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const ASSET_ROUTE = "POST /api/assets/upload";
const IMPORT_ROUTE = "POST /api/import";
const CARD_JSON =
  '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tester","description":"A test character."}}';

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
    body: (data: string | Uint8Array | null, status = 200): Response =>
      new Response(data, { status }),
    req: { formData: (): Promise<FormData> => Promise.resolve(form) },
  };
}

function uploadRoutes(deps: UploadDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const app = {
    post: (path: string, routeHandler: Handler): unknown => {
      routes.set(`POST ${path}`, routeHandler);
      return app;
    },
  };
  registerUpload(app as unknown as Parameters<typeof registerUpload>[0], deps);
  return routes;
}

function handlerFor(deps: UploadDeps, key: string): Handler {
  const handler = uploadRoutes(deps).get(key);
  if (handler === undefined) {
    throw new Error(`route not registered: ${key}`);
  }
  return handler;
}

const STORED: StoredAsset = {
  assetId: castId<AssetId>("ast_1"),
  hash: "h".repeat(64),
  size: 3,
  created: true,
};
const okAssets: UploadAssetsPort = { store: (): Promise<StoredAsset> => Promise.resolve(STORED) };

// A character port that always creates a fresh row (the import-route happy path).
const creatingCharacter: ImportCharacterPort = {
  create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_1") }),
  findByImportHash: (): Promise<null> => Promise.resolve(null),
};
// A no-op tag port (the card/pending carry behavior is proven in the run-profile-import suite).
const noopTag: ImportTagPort = {
  attachCardTagByName: (): Promise<boolean> => Promise.resolve(true),
};
const okDeps: UploadDeps = { assets: okAssets, character: creatingCharacter, tag: noopTag };

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

  test("valid upload → store(enforceMagic:true, kind, mime) → StoredAsset", async () => {
    const calls: { kind: string; mime: string; enforceMagic: boolean | undefined }[] = [];
    const deps: UploadDeps = {
      assets: {
        store: (p): Promise<StoredAsset> => {
          calls.push({ kind: p.kind, mime: p.mime, enforceMagic: p.enforceMagic });
          return Promise.resolve(STORED);
        },
      },
      character: creatingCharacter,
      tag: noopTag,
    };
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    form.append("kind", "avatar");
    const res = await handlerFor(deps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STORED);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ kind: "avatar", mime: "image/png", enforceMagic: true });
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
    form.append(
      "file",
      new File([new TextEncoder().encode(CARD_JSON)], "Aria.json", { type: "application/json" }),
    );
    const res = await handlerFor(okDeps, IMPORT_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    const result = (await res.json()) as { imported: unknown[]; failed: unknown[] };
    expect(result.imported).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });
});
