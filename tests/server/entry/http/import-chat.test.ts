// entry/http/import-chat — the single-transcript import route. Pins the THIN-ARM contract: every accepted
// file reaches the portability registry's `chat` descriptor (never a parallel import path) under its own
// filename, so the descriptor re-links it by the display name its header carries. Also pins the belt chain
// ([authCsrfGuard, bodyCap, handler]) and the per-file failure ISOLATION (one bad transcript never fails
// the batch). Hono isn't test-resolvable, so the registrar runs over a captured mock app + context (the
// upload.test.ts pattern).

import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ImportChatDeps } from "@orb/server/entry/http";
import { registerImportChat } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const COOKIE_OWNER: Principal = { ...OWNER, via: "cookie" };
const CHAT_ROUTE = "POST /api/import/chat";
/** The registration-time compose guard's message (hoisted — a literal inside a test body is a perf lint). */
const NO_DESCRIPTOR = /no chat descriptor/u;

// biome-ignore-start lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) ARE the format.
/** A minimal but REAL chat `.jsonl`: the header line + one message line (what export/ST both emit). */
function transcript(characterName: string): string {
  return `${JSON.stringify({ user_name: "Alex", character_name: characterName, create_date: "2026-01-01@00h00m00s" })}\n${JSON.stringify({
    name: characterName,
    is_user: false,
    mes: "Hello.",
  })}\n`;
}
// biome-ignore-end lint/style/useNamingConvention: end of the ST wire-vocab block.

function fileOf(name: string, text: string): File {
  return new File([text], name, { type: "application/x-ndjson" });
}

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
    json: (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    body: (data: string | Uint8Array | null, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: { formData: (): Promise<FormData> => Promise.resolve(form) },
  };
}

function chains(deps: ImportChatDeps): Map<string, Handler[]> {
  const routes = new Map<string, Handler[]>();
  const app = {
    post: (path: string, ...handlers: Handler[]): unknown => {
      routes.set(`POST ${path}`, handlers);
      return app;
    },
  };
  // A route-CAPTURING stand-in for Hono's `app` (Hono is not test-resolvable), narrowed to the one `.post`
  // this registrar calls — the identical capture harness the sibling upload/export slice tests use.
  // @orb-waive no-test-fabrication(unknown): not a fabricated domain value — a test-local capture object, never a typed row. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerImportChat(app as unknown as Parameters<typeof registerImportChat>[0], deps);
  return routes;
}

function chainFor(deps: ImportChatDeps): Handler[] {
  const chain = chains(deps).get(CHAT_ROUTE);
  if (chain === undefined) {
    throw new Error(`route not registered: ${CHAT_ROUTE}`);
  }
  return chain;
}

function handlerFor(deps: ImportChatDeps): Handler {
  const handler = chainFor(deps).at(-1);
  if (handler === undefined) {
    throw new Error("route has no handler");
  }
  return handler;
}

/** The calls the stub descriptor saw — the THIN-ARM assertion surface. */
interface DescriptorSpy {
  readonly deps: ImportChatDeps;
  readonly calls: { ownerId: UserId; file: PortableFile }[];
}

/** A registry whose `chat` descriptor records every `importFile` call and answers with `outcomeOf(file)`. */
function spyRegistry(outcome: PortableImportOutcome | ((file: PortableFile) => PortableImportOutcome) = { ok: true, created: true }): DescriptorSpy {
  const calls: { ownerId: UserId; file: PortableFile }[] = [];
  const outcomeOf = typeof outcome === "function" ? outcome : (): PortableImportOutcome => outcome;
  const chat: PortableEntity = {
    kind: "chat",
    dir: "chats/",
    ext: ".jsonl",
    async *exportAll(): AsyncIterable<PortableFile> {
      // no-op: this suite only drives the import leg.
    },
    importFile: (ownerId, file) => {
      calls.push({ ownerId, file });
      return Promise.resolve(outcomeOf(file));
    },
  };
  return { deps: { registry: [chat] }, calls };
}

interface RouteBody {
  readonly imported: readonly { readonly filename: string; readonly created: boolean }[];
  readonly failed: readonly { readonly filename: string; readonly error: string }[];
  readonly memoryChatIds: readonly string[];
}

describe("registerImportChat — registration + belts", () => {
  test("a registry with no chat descriptor fails LOUD at registration (a composition bug, never a silent no-op)", () => {
    expect(() => chains({ registry: [] })).toThrow(NO_DESCRIPTOR);
  });

  test("mounts the belt chain [authCsrfGuard, bodyCap, handler]", () => {
    expect(chainFor(spyRegistry().deps)).toHaveLength(3);
  });

  test("anonymous caller → 401 before the body is read", async () => {
    const spy = spyRegistry();
    interface GuardCtx {
      readonly get: (key: string) => Principal | null;
      readonly body: (data: null, status?: number) => Response;
      readonly req: { readonly raw: { readonly headers: Headers } };
    }
    // Narrowing the real Hono `Handler` (chain[0]) to the middleware call-shape so it runs on a stub ctx.
    // @orb-waive no-test-fabrication(unknown): a test-local function type, not a fabricated domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chainFor(spy.deps)[0] as unknown as (c: GuardCtx, next: () => Promise<void>) => Promise<Response | undefined>;
    const res = await guard(
      {
        get: (): Principal | null => null,
        body: (data: null, status = 200): Response => new Response(data, { status }),
        req: { raw: { headers: new Headers() } },
      },
      () => Promise.resolve(),
    );
    expect(res?.status).toBe(401);
  });

  test("cookie caller without the CSRF header → 403; with it, falls through", async () => {
    const spy = spyRegistry();
    interface GuardCtx {
      readonly get: (key: string) => Principal | null;
      readonly body: (data: null, status?: number) => Response;
      readonly req: { readonly raw: { readonly headers: Headers } };
    }
    // @orb-waive no-test-fabrication(unknown): see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chainFor(spy.deps)[0] as unknown as (c: GuardCtx, next: () => Promise<void>) => Promise<Response | undefined>;
    const ctxWith = (headers: Record<string, string>): GuardCtx => ({
      get: (key: string): Principal | null => (key === "principal" ? COOKIE_OWNER : null),
      body: (data: null, status = 200): Response => new Response(data, { status }),
      req: { raw: { headers: new Headers(headers) } },
    });
    const blocked = await guard(ctxWith({}), () => Promise.resolve());
    expect(blocked?.status).toBe(403);

    let nexted = false;
    const allowed = await guard(ctxWith({ [CSRF_HEADER]: "1" }), () => {
      nexted = true;
      return Promise.resolve();
    });
    expect(allowed).toBeUndefined();
    expect(nexted).toBe(true);
  });

  // #300 — the loopback owner FALLBACK arm is ambient-credential too; this CORS-simple multipart route must
  // require the CSRF header for it, else a loopback web origin drives an owner chat import.
  test("fallback caller WITHOUT the CSRF header → 403 (#300)", async () => {
    const spy = spyRegistry();
    interface GuardCtx {
      readonly get: (key: string) => Principal | null;
      readonly body: (data: null, status?: number) => Response;
      readonly req: { readonly raw: { readonly headers: Headers } };
    }
    // @orb-waive no-test-fabrication(unknown): see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chainFor(spy.deps)[0] as unknown as (c: GuardCtx, next: () => Promise<void>) => Promise<Response | undefined>;
    const ctx: GuardCtx = {
      get: (key: string): Principal | null => (key === "principal" ? OWNER : null),
      body: (data: null, status = 200): Response => new Response(data, { status }),
      req: { raw: { headers: new Headers() } },
    };
    const blocked = await guard(ctx, () => Promise.resolve());
    expect(blocked?.status).toBe(403);
  });
});

describe("registerImportChat — the thin arm over the chat descriptor", () => {
  test("no file parts → 400, descriptor untouched", async () => {
    const spy = spyRegistry();
    const res = await handlerFor(spy.deps)(makeCtx(OWNER, new FormData()));
    expect(res.status).toBe(400);
    expect(spy.calls).toHaveLength(0);
  });

  test("R6: an ORB-NATIVE bundle reaches the descriptor with its filename UNTOUCHED — the door does not force-parse it as ST jsonl", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    // Real orb-native bytes (the envelope is what the descriptor's format router reads). This file carries
    // its OWN seat list, so the route must NOT synthesize a `<handle>/` prefix from a jsonl `character_name`
    // it does not have — and before R6 it did exactly that to every upload, refusing every bundle at the
    // door with "not a valid chat file" before the router downstream ever saw it.
    const bundle = new File([JSON.stringify({ schemaKind: "orb.chat.bundle", schemaVersion: 1 })], "aria-a-long-road.orb.json", { type: "application/json" });
    form.append("file", bundle);
    const res = await handlerFor(spy.deps)(makeCtx(OWNER, form));

    expect(res.status).toBe(200);
    expect(spy.calls.map((call) => call.file.filename)).toEqual(["aria-a-long-road.orb.json"]);
    expect(spy.calls.map((call) => call.ownerId)).toEqual([OWNER.userId]);
  });

  test("a transcript reaches the descriptor under its own filename, owner-scoped — no handle is guessed from its name", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    form.append("file", fileOf("Elara Vance - 2026-01-01.jsonl", transcript("Elara Vance")));
    const res = await handlerFor(spy.deps)(makeCtx(OWNER, form));

    expect(res.status).toBe(200);
    // The filename is preserved verbatim — the descriptor's parse reads the branch/date hints off it.
    expect(spy.calls.map((call) => call.file.filename)).toEqual(["Elara Vance - 2026-01-01.jsonl"]);
    expect(spy.calls.map((call) => call.ownerId)).toEqual([OWNER.userId]);
    const body = (await res.json()) as RouteBody;
    expect(body.imported).toEqual([{ filename: "Elara Vance - 2026-01-01.jsonl", created: true }]);
    expect(body.failed).toHaveLength(0);
  });

  test("a re-import the descriptor deduped reports created:false (idempotent), not a failure", async () => {
    const spy = spyRegistry({ ok: true, created: false });
    const form = new FormData();
    form.append("file", fileOf("aria.jsonl", transcript("Aria")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.imported).toEqual([{ filename: "aria.jsonl", created: false }]);
  });

  test("the descriptor's refusal (no such character on this account) rides back as a per-file reason", async () => {
    const spy = spyRegistry({ ok: false, error: 'no character named "Ghost" on this account' });
    const form = new FormData();
    form.append("file", fileOf("ghost.jsonl", transcript("Ghost")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.imported).toHaveLength(0);
    expect(body.failed).toEqual([{ filename: "ghost.jsonl", error: 'no character named "Ghost" on this account' }]);
  });

  test("per-file isolation: one bad transcript in a batch never fails the good ones", async () => {
    const spy = spyRegistry((file) => (file.filename === "bad.jsonl" ? { ok: false, error: "not a valid chat .jsonl file" } : { ok: true, created: true }));
    const form = new FormData();
    form.append("file", fileOf("good.jsonl", transcript("Aria")));
    form.append("file", fileOf("bad.jsonl", "garbage\n"));
    form.append("file", fileOf("also-good.jsonl", transcript("Bee")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.imported.map((row) => row.filename)).toEqual(["good.jsonl", "also-good.jsonl"]);
    expect(body.failed.map((row) => row.filename)).toEqual(["bad.jsonl"]);
    expect(spy.calls.map((call) => call.file.filename)).toEqual(["good.jsonl", "bad.jsonl", "also-good.jsonl"]);
  });

  // The import enqueues no memory build; the body carries every real conversation the batch wrote, in file order,
  // which is the whole scope the client's "Build memory for imported chats" offer hands to the backfill.
  test("the batch's written conversations ride back as ONE memory scope, in file order, failures contributing none", async () => {
    const aria = mintTypeId(ID_PREFIX.chat);
    const bee = mintTypeId(ID_PREFIX.chat);
    const spy = spyRegistry((file) => {
      if (file.filename === "bad.jsonl") {
        return { ok: false, error: "not a valid chat .jsonl file" };
      }
      return { ok: true, created: true, memoryChatIds: [file.filename === "aria.jsonl" ? aria : bee] };
    });
    const form = new FormData();
    form.append("file", fileOf("aria.jsonl", transcript("Aria")));
    form.append("file", fileOf("bad.jsonl", "garbage\n"));
    form.append("file", fileOf("bee.jsonl", transcript("Bee")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.memoryChatIds).toEqual([aria, bee]);
  });
});
