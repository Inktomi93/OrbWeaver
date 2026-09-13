// entry/http/upload — the multipart ingest routes. Pins: both routes mount the belt chain
// [authCsrfGuard, bodyCap, handler]; the guard 401s the anonymous caller + 403s a cookie mutation missing
// the CSRF header (BEFORE the body is read); the asset route validates file + kind (400) and calls store
// with enforceMagic:true + a maxBytes cap; the import route delegates to run-profile-import (400 with no
// files; otherwise the per-card outcome); and the #1598 card-lorebook RESTORE door refuses — as a 400 body,
// never a throw — a card no character of this owner was imported from. Hono isn't test-resolvable, so the registrars run over a captured
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
import { expect, test } from "../../../support/fixtures.ts";

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
const LOREBOOK_RESTORE_ROUTE = "POST /api/import/restore-card-lorebook";
// The #1598 restore door reads a card's EMBEDDED book, so its fixture must carry one (raw ST wire TEXT —
// snake_case by spec — so the fixture states the interchange spelling without a naming suppression).
const CARD_JSON_WITH_BOOK =
  '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Tester","description":"A test character.","character_book":{"name":"Test World","entries":[{"keys":["k"],"content":"c","comment":"C","insertion_order":1}]}}}';

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
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
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
  // @orb-waive no-test-fabrication(unknown): minimal route-capture mock; the real framework app type is far larger than what route REGISTRATION exercises here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
  // @orb-waive no-test-fabrication(unknown): not a fabricated domain value — GuardMw is a test-local function type. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
const okAssets: UploadAssetsPort = {
  store: (): Promise<StoredAsset> => Promise.resolve(STORED),
};

// A character port that always creates a fresh row (the import-route happy path). The handle-suffix
// disambiguation loop is pinned in the run-profile-import + domain import-character suites; `findByHandle`
// is an unused no-op stub here (it always misses, so create always fires — #1470 dropped the earlier
// PD-108 handle-match edit-in-place, so `ImportCharacterPort` no longer carries an `update` op).
const creatingCharacter: ImportCharacterPort = {
  create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_1") }),
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
  // #1598: no character in this suite already holds a primary book, so the seat always reads FREE and the
  // import route's embedded-book plane behaves exactly as it did before the guard existed.
  hasPrimaryBook: () => Promise.resolve(false),
  linkCarriedBooks: () => Promise.resolve({ linked: 0, skipped: 0 }),
};
// The databank doc-ingest route is exercised in the databank domain suite; this suite only needs the port to
// satisfy UploadDeps (its handlers are the asset + import routes).
const noopDatabank: UploadDeps["databank"] = { upload: () => Promise.reject(new Error("databank upload not exercised in this suite")) };

// A generous effective image cap so the DEFAULT paths keep asserting the fixed 64 MiB route cap; the
// image-clamp test overrides it to a tighter value to prove the min() takes it.
const ROUTE_CAP_BYTES = 64 * 1024 * 1024;
const DATABANK_ROUTE_CAP_BYTES = 20 * 1024 * 1024;
const generousMaxImageBytes = (): number => ROUTE_CAP_BYTES * 2;
const routeMaxDatabankBytes = (): number => DATABANK_ROUTE_CAP_BYTES;

const okDeps: UploadDeps = {
  assets: okAssets,
  character: creatingCharacter,
  tag: noopTag,
  worldInfo: noopWorldInfo,
  databank: noopDatabank,
  maxImageBytes: generousMaxImageBytes,
  maxDatabankBytes: routeMaxDatabankBytes,
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
      databank: noopDatabank,
      maxImageBytes: generousMaxImageBytes,
      maxDatabankBytes: routeMaxDatabankBytes,
    };
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    form.append("kind", "avatar");
    const res = await handlerFor(deps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STORED);
    expect(calls).toHaveLength(1);
    // PD-94: the route passes the store's maxBytes belt (64 MiB route cap; maxImageBytes is looser here so
    // the route cap wins) alongside enforceMagic.
    expect(calls[0]).toEqual({
      kind: "avatar",
      mime: "image/png",
      enforceMagic: true,
      maxBytes: ROUTE_CAP_BYTES,
    });
  });

  test("image kind honors the TIGHTER of the route cap and the admin maxImageBytes", async () => {
    const tighter = 5 * 1024 * 1024;
    const calls: number[] = [];
    const deps: UploadDeps = {
      ...okDeps,
      assets: {
        store: (p: Parameters<UploadAssetsPort["store"]>[0]): Promise<StoredAsset> => {
          if (p.maxBytes !== undefined) {
            calls.push(p.maxBytes);
          }
          return Promise.resolve(STORED);
        },
      },
      maxImageBytes: () => tighter,
    };
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    form.append("kind", "avatar");
    await handlerFor(deps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(calls).toEqual([tighter]);
  });

  test("a NON-image kind keeps the fixed route cap, ignoring a tighter maxImageBytes", async () => {
    const calls: number[] = [];
    const deps: UploadDeps = {
      ...okDeps,
      assets: {
        store: (p: Parameters<UploadAssetsPort["store"]>[0]): Promise<StoredAsset> => {
          if (p.maxBytes !== undefined) {
            calls.push(p.maxBytes);
          }
          return Promise.resolve(STORED);
        },
      },
      maxImageBytes: () => 1024,
    };
    const form = new FormData();
    // A plugin bundle is a non-image kind (application/zip) — the tighter image cap must NOT apply.
    form.append("file", new File([new Uint8Array([1, 2, 3])], "p.zip", { type: "application/zip" }));
    form.append("kind", "plugin");
    await handlerFor(deps, ASSET_ROUTE)(makeCtx(OWNER, form));
    expect(calls).toEqual([ROUTE_CAP_BYTES]);
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

describe("registerUpload — the #1598 card-lorebook RESTORE door", () => {
  test("anonymous → 401", async () => {
    const res = await handlerFor(okDeps, LOREBOOK_RESTORE_ROUTE)(makeCtx(null, new FormData()));
    expect(res.status).toBe(401);
  });

  test("no card file → 400", async () => {
    const res = await handlerFor(okDeps, LOREBOOK_RESTORE_ROUTE)(makeCtx(OWNER, new FormData()));
    expect(res.status).toBe(400);
  });

  test("a card this owner never imported → 400 carrying the verb's own refusal (never a throw)", async () => {
    // `creatingCharacter.findByImportHash` always misses, which IS the refusal arm: a restore may only land
    // on the character those exact bytes imported as.
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode(CARD_JSON_WITH_BOOK)], "Aria.json", { type: "application/json" }));
    const res = await handlerFor(okDeps, LOREBOOK_RESTORE_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(400);
    expect((await res.json()) as { ok: boolean; error: string }).toStrictEqual({
      ok: false,
      error: expect.stringContaining("No character of yours was imported from this exact card file"),
    });
  });

  test("a card that DID import → 200 with the world-info write's own result", async () => {
    const importedDeps: UploadDeps = {
      ...okDeps,
      character: { ...creatingCharacter, findByImportHash: () => Promise.resolve({ characterId: castId<CharacterId>("chr_1") }) },
    };
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode(CARD_JSON_WITH_BOOK)], "Aria.json", { type: "application/json" }));
    const res = await handlerFor(importedDeps, LOREBOOK_RESTORE_ROUTE)(makeCtx(OWNER, form));
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean; characterId: CharacterId }).toMatchObject({ ok: true, characterId: "chr_1" });
  });
});

describe("registerUpload — auth+CSRF guard (belt order, before the body is read)", () => {
  test("every mutating route mounts [authCsrfGuard, bodyCap, handler] — auth runs BEFORE the body cap", () => {
    for (const key of [ASSET_ROUTE, IMPORT_ROUTE, LOREBOOK_RESTORE_ROUTE]) {
      expect(chainFor(okDeps, key)).toHaveLength(3);
    }
  });

  for (const key of [ASSET_ROUTE, IMPORT_ROUTE, LOREBOOK_RESTORE_ROUTE]) {
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

    // #300 — the fallback (loopback owner) arm is AMBIENT-credential, like cookie: a multipart CSRF from a
    // loopback web origin rides it. `multipart/form-data` is CORS-simple (no preflight), so the peer gate
    // alone doesn't stop it — this route MUST require the CSRF header for `via:"fallback"` too.
    test(`${key}: fallback principal WITHOUT the CSRF header → 403 (#300 — was a silent owner write)`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(OWNER));
      expect(status).toBe(403);
      expect(nexted).toBe(false);
    });

    test(`${key}: fallback principal WITH the CSRF header → passes to the body cap`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx(OWNER, { [CSRF_HEADER]: "1" }));
      expect(status).toBeNull();
      expect(nexted).toBe(true);
    });

    // Only the proxy-asserted `via:"header"` arm stays CSRF-exempt (a browser can't forge the proxy's headers).
    test(`${key}: SSO header principal is exempt → passes with no CSRF header`, async () => {
      const { status, nexted } = await runGuard(okDeps, key, guardCtx({ ...OWNER, via: "header" }));
      expect(status).toBeNull();
      expect(nexted).toBe(true);
    });
  }
});
