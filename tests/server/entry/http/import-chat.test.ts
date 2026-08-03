// entry/http/import-chat — the single-transcript import route. Pins the THIN-ARM contract: every accepted
// file reaches the portability registry's `chat` descriptor (never a parallel import path), and the bundle
// path `<handle>/<leaf>` is derived from the transcript's OWN `character_name` header via the same
// `slugifyHandle` derivation card import mints handles with. Also pins the belt chain
// ([authCsrfGuard, bodyCap, handler]) and the per-file failure ISOLATION (one bad transcript never fails
// the batch). Hono isn't test-resolvable, so the registrar runs over a captured mock app + context (the
// upload.test.ts pattern).

import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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
    body: (data: string | Uint8Array | null, status = 200): Response => new Response(data, { status }),
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
  // FABRICATION-OK: not a fabricated domain value — a test-local capture object, never a typed row.
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

/** A registry whose `chat` descriptor records every `importFile` call and answers with `outcome`. */
function spyRegistry(outcome: PortableImportOutcome = { ok: true, created: true }): DescriptorSpy {
  const calls: { ownerId: UserId; file: PortableFile }[] = [];
  const chat: PortableEntity = {
    kind: "chat",
    dir: "chats/",
    ext: ".jsonl",
    // eslint-disable-next-line @typescript-eslint/require-await
    async *exportAll(): AsyncIterable<PortableFile> {
      // no-op: this suite only drives the import leg.
    },
    importFile: (ownerId, file) => {
      calls.push({ ownerId, file });
      return Promise.resolve(outcome);
    },
  };
  return { deps: { registry: [chat] }, calls };
}

interface RouteBody {
  readonly imported: readonly { readonly filename: string; readonly created: boolean }[];
  readonly failed: readonly { readonly filename: string; readonly error: string }[];
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
    // FABRICATION-OK: a test-local function type, not a fabricated domain value.
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
    // FABRICATION-OK: see above.
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
});

describe("registerImportChat — the thin arm over the chat descriptor", () => {
  test("no file parts → 400, descriptor untouched", async () => {
    const spy = spyRegistry();
    const res = await handlerFor(spy.deps)(makeCtx(OWNER, new FormData()));
    expect(res.status).toBe(400);
    expect(spy.calls).toHaveLength(0);
  });

  test("a transcript routes to the descriptor as <slugified character_name>/<filename>, owner-scoped", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    form.append("file", fileOf("Elara Vance - 2026-01-01.jsonl", transcript("Elara Vance")));
    const res = await handlerFor(spy.deps)(makeCtx(OWNER, form));

    expect(res.status).toBe(200);
    // The leaf is preserved verbatim — the descriptor's parse reads the branch/date hints off it.
    expect(spy.calls.map((call) => call.file.filename)).toEqual(["elara-vance/Elara Vance - 2026-01-01.jsonl"]);
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
    const spy = spyRegistry({ ok: false, error: 'no character with handle "ghost" on this account' });
    const form = new FormData();
    form.append("file", fileOf("ghost.jsonl", transcript("Ghost")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.imported).toHaveLength(0);
    expect(body.failed[0]?.error).toContain("no character with handle");
  });

  test("an unparseable file is refused BEFORE the descriptor sees it", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    form.append("file", fileOf("notes.jsonl", "this is not json\n"));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(spy.calls).toHaveLength(0);
    expect(body.failed).toEqual([{ filename: "notes.jsonl", error: "not a valid chat .jsonl file" }]);
  });

  test("a transcript naming nobody is refused with a reason, never routed to an empty handle", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    // ST writes the literal "unused" when a chat has no character — the serde collapses it to the (empty)
    // directory fallback, so there is no name to route by.
    form.append("file", fileOf("orphan.jsonl", transcript("unused")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(spy.calls).toHaveLength(0);
    expect(body.failed[0]?.error).toContain("names no character");
  });

  test("per-file isolation: one bad transcript in a batch never fails the good ones", async () => {
    const spy = spyRegistry();
    const form = new FormData();
    form.append("file", fileOf("good.jsonl", transcript("Aria")));
    form.append("file", fileOf("bad.jsonl", "garbage\n"));
    form.append("file", fileOf("also-good.jsonl", transcript("Bee")));
    const body = (await (await handlerFor(spy.deps)(makeCtx(OWNER, form))).json()) as RouteBody;
    expect(body.imported.map((row) => row.filename)).toEqual(["good.jsonl", "also-good.jsonl"]);
    expect(body.failed.map((row) => row.filename)).toEqual(["bad.jsonl"]);
    expect(spy.calls.map((call) => call.file.filename)).toEqual(["aria/good.jsonl", "bee/also-good.jsonl"]);
  });
});
