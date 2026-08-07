// entry/http/export — the download registrar (PD-109). Pins: anonymous → 401 on both routes; a verb
// `null` (not-owned/not-host, or missing — the verbs collapse these) → 404; a served card carries
// `image/png` + a filename `Content-Disposition`; a served chat defaults to `jsonl` (`application/x-ndjson`)
// and honors `?format=txt` (`text/plain`); an invalid `?format=` → 400 without calling the verb. Hono isn't
// test-resolvable (not hoisted), so the registrar runs over a captured mock app + context (same pattern as
// `blob.test.ts`/`upload.test.ts`).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ExportService } from "@orb/server/domain/export";
import type { ExportDeps } from "@orb/server/entry/http";
import { registerExport } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const CHARACTER_ID = castId<CharacterId>("character_test");
const CHAT_ID = castId<ChatId>("chat_test");
const CHARACTER_ROUTE = "GET /api/export/character/:characterId";
const CHAT_ROUTE = "GET /api/export/chat/:chatId";

interface MockReq {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
}
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
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
    json: (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    body: (data: string | Uint8Array | null, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: {
      param: (name: string): string => req.params?.[name] ?? "",
      query: (name: string): string | undefined => req.query?.[name],
    },
  };
}

function exportRoutes(deps: ExportDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  registerExport(app as unknown as Parameters<typeof registerExport>[0], deps);
  return routes;
}

function handlerFor(deps: ExportDeps, route: string): Handler {
  const handler = exportRoutes(deps).get(route);
  if (handler === undefined) {
    throw new Error(`${route} not registered`);
  }
  return handler;
}

const CARD = { bytes: new Uint8Array([1, 2, 3]), filename: "aria.png" };
const TRANSCRIPT = { text: '{"line":1}\n', filename: "chat.jsonl" };

function stubExport(overrides: Partial<Pick<ExportService, "exportCharacter" | "exportChat">>): ExportDeps {
  return {
    export: {
      exportCharacter: (): Promise<null> => Promise.resolve(null),
      exportChat: (): Promise<null> => Promise.resolve(null),
      ...overrides,
    },
    // The library route's injected portability registry — empty here (these tests exercise the single-entity
    // character/chat routes; the library route + registry streaming is pinned in the zip + bundle suites).
    registry: [],
  };
}

describe("registerExport — character route", () => {
  test("anonymous caller → 401, no body", async () => {
    const deps = stubExport({});
    const res = await handlerFor(deps, CHARACTER_ROUTE)(makeCtx(null, { params: { characterId: CHARACTER_ID } }));
    expect(res.status).toBe(401);
  });

  test("not-owned / missing character → 404", async () => {
    const deps = stubExport({ exportCharacter: (): Promise<null> => Promise.resolve(null) });
    const res = await handlerFor(deps, CHARACTER_ROUTE)(makeCtx(OWNER, { params: { characterId: CHARACTER_ID } }));
    expect(res.status).toBe(404);
  });

  test("owned character → 200 image/png + filename disposition + bytes", async () => {
    const deps = stubExport({ exportCharacter: (): Promise<typeof CARD> => Promise.resolve(CARD) });
    const res = await handlerFor(deps, CHARACTER_ROUTE)(makeCtx(OWNER, { params: { characterId: CHARACTER_ID } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="aria.png"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(CARD.bytes);
  });
});

describe("registerExport — chat route", () => {
  test("anonymous caller → 401, no body", async () => {
    const deps = stubExport({});
    const res = await handlerFor(deps, CHAT_ROUTE)(makeCtx(null, { params: { chatId: CHAT_ID } }));
    expect(res.status).toBe(401);
  });

  test("non-host / missing chat → 404", async () => {
    const deps = stubExport({ exportChat: (): Promise<null> => Promise.resolve(null) });
    const res = await handlerFor(deps, CHAT_ROUTE)(makeCtx(OWNER, { params: { chatId: CHAT_ID } }));
    expect(res.status).toBe(404);
  });

  test("default format → 200 application/x-ndjson + jsonl filename", async () => {
    const deps = stubExport({
      exportChat: (): Promise<typeof TRANSCRIPT> => Promise.resolve(TRANSCRIPT),
    });
    const res = await handlerFor(deps, CHAT_ROUTE)(makeCtx(OWNER, { params: { chatId: CHAT_ID } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="chat.jsonl"');
    expect(await res.text()).toBe(TRANSCRIPT.text);
  });

  test("?format=txt → 200 text/plain, verb receives format:'txt'", async () => {
    let receivedFormat: string | undefined;
    const txt = { text: "Aria: hi\n", filename: "chat.txt" };
    const deps = stubExport({
      exportChat: (params): Promise<typeof txt> => {
        receivedFormat = params.format;
        return Promise.resolve(txt);
      },
    });
    const res = await handlerFor(deps, CHAT_ROUTE)(makeCtx(OWNER, { params: { chatId: CHAT_ID }, query: { format: "txt" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(receivedFormat).toBe("txt");
  });

  test("invalid ?format= → 400 without calling exportChat", async () => {
    let called = false;
    const deps = stubExport({
      exportChat: (): Promise<null> => {
        called = true;
        return Promise.resolve(null);
      },
    });
    const res = await handlerFor(deps, CHAT_ROUTE)(makeCtx(OWNER, { params: { chatId: CHAT_ID }, query: { format: "yaml" } }));
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });
});
