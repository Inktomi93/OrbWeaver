// entry/http/import-tree — the folder-upload ingest route (an INGEST TRUST BOUNDARY). Pins the belts a green
// gate cannot see: the [authCsrfGuard, bodyCap, handler] chain (auth 401 + CSRF 403 before the body is read);
// fail-closed path sanitization (traversal / absolute / backslash / NUL → 400, nothing staged, start NOT
// called); per-file + count DoS caps (413); the layout sniff dispatching to the right workload with the
// caller's OWN ownerId (import-st for an ST profile tree, import-bundle+source:dir for an orb tree); the
// ambiguous/unrecognized reject (400); and that a successful upload stages the normalized tree to disk while
// a reject leaves nothing behind. The Hono app + File aren't test-resolvable through Hono, so the registrar
// runs over a captured mock app + ctx (the same seam upload.test uses).

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableEntity, PortableFile, PortableKind } from "@orb/contracts/portability";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportTreeDeps } from "@orb/server/entry/http";
import { registerImportTree } from "@orb/server/entry/http";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const TREE_ROUTE = "POST /api/import/tree";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const COOKIE_OWNER: Principal = { ...OWNER, via: "cookie" };

/** An empty export stream — the route never calls exportAll, so a done-on-first-next iterator suffices. */
const EMPTY_EXPORT: AsyncIterable<PortableFile> = {
  [Symbol.asyncIterator]: () => ({
    next: (): Promise<IteratorResult<PortableFile>> => Promise.resolve({ done: true, value: undefined }),
  }),
};

/** A stub registry carrying only the `dir` each descriptor advertises (the sniff's sole registry input). */
function fakeRegistry(): PortabilityRegistry {
  const dirs: readonly [PortableKind, string][] = [
    ["character", "characters/"],
    ["chat", "chats/"],
    ["persona", "personas/"],
    ["preset", "presets/"],
    ["world-info", "world-info/"],
    ["tag", "tags/"],
  ];
  return dirs.map(
    ([kind, dir]): PortableEntity => ({
      kind,
      dir,
      ext: "",
      exportAll: () => EMPTY_EXPORT,
      importFile: () => Promise.resolve({ ok: true }),
    }),
  );
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
    get: (key): Principal | null => (key === "principal" ? principal : null),
    json: (body, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    body: (data, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: { formData: (): Promise<FormData> => Promise.resolve(form) },
  };
}

// ── The auth+CSRF guard (chain[0]) exercised on its own. ──────────────────────────────────────────────────
interface GuardCtx {
  readonly get: (key: string) => Principal | null;
  readonly body: (data: null, status?: number) => Response;
  readonly req: { readonly raw: { readonly headers: Headers } };
}
type GuardMw = (c: GuardCtx, next: () => Promise<void>) => Promise<Response | undefined>;

function guardCtx(principal: Principal | null, headers?: Record<string, string>): GuardCtx {
  return {
    get: (key): Principal | null => (key === "principal" ? principal : null),
    body: (data: null, status = 200): Response => new Response(data, { status }),
    req: { raw: { headers: new Headers(headers) } },
  };
}

let stagingDir: string;
const startSpy = vi.fn<(p: { input: { kind: string; params: Record<string, unknown> }; ownerId: UserId | null }) => Promise<{ id: WorkloadId }>>();

function deps(): ImportTreeDeps {
  return { workloads: { start: startSpy }, registry: fakeRegistry(), stagingDir };
}

/** Capture the belt chain the registrar mounts. */
function chain(): Handler[] {
  const routes = new Map<string, Handler[]>();
  const app = {
    post: (path: string, ...handlers: Handler[]): unknown => {
      routes.set(`POST ${path}`, handlers);
      return app;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerImportTree(app as unknown as Parameters<typeof registerImportTree>[0], deps());
  const c = routes.get(TREE_ROUTE);
  if (c === undefined) {
    throw new Error("tree route not registered");
  }
  return c;
}

function handler(): Handler {
  const h = chain().at(-1);
  if (h === undefined) {
    throw new Error("no handler");
  }
  return h;
}

function fileOf(relPath: string, bytes = new Uint8Array([1, 2, 3])): File {
  return new File([bytes], relPath);
}

function formOf(...files: readonly File[]): FormData {
  const form = new FormData();
  for (const f of files) {
    form.append("file", f);
  }
  return form;
}

/** The uploader's OWN staging subdir (#1534): the route stages under `<root>/<userId>/`, so a staged tree is
 *  only ever addressable by a workload row owned by that user. Absent subdir = nothing was staged. */
function ownerStagingRoot(userId: UserId = OWNER.userId): string {
  return join(stagingDir, userId);
}

async function stagedSubdirs(): Promise<string[]> {
  const ents = await readdir(ownerStagingRoot(), { withFileTypes: true }).catch(() => []);
  return ents.filter((e) => e.isDirectory()).map((e) => e.name);
}

beforeEach(async () => {
  stagingDir = await mkdtemp(join(tmpdir(), "orb-tree-test-"));
  startSpy.mockReset();
  startSpy.mockResolvedValue({ id: castId<WorkloadId>("workload_1") });
});

afterEach(async () => {
  await rm(stagingDir, { recursive: true, force: true });
});

describe("registerImportTree — belt chain + guard", () => {
  test("mounts [authCsrfGuard, bodyCap, handler]", () => {
    expect(chain()).toHaveLength(3);
  });

  test("anonymous → 401, never reaches next", async () => {
    let nexted = false;
    // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware (chain[0]) to the minimal call-shape for a stub ctx. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chain()[0] as unknown as GuardMw;
    const res = await guard(guardCtx(null), () => {
      nexted = true;
      return Promise.resolve();
    });
    expect(res instanceof Response ? res.status : null).toBe(401);
    expect(nexted).toBe(false);
  });

  test("cookie session WITHOUT the CSRF header → 403", async () => {
    // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware (chain[0]) to the minimal call-shape for a stub ctx. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chain()[0] as unknown as GuardMw;
    const res = await guard(guardCtx(COOKIE_OWNER), () => Promise.resolve());
    expect(res instanceof Response ? res.status : null).toBe(403);
  });

  // #300 — the loopback owner FALLBACK arm is ambient-credential too; this CORS-simple multipart route must
  // require the CSRF header for it (OWNER is via:"fallback"), else a loopback web origin drives an owner import.
  test("fallback session WITHOUT the CSRF header → 403 (#300)", async () => {
    // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware (chain[0]) to the minimal call-shape for a stub ctx. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const guard = chain()[0] as unknown as GuardMw;
    const res = await guard(guardCtx(OWNER), () => Promise.resolve());
    expect(res instanceof Response ? res.status : null).toBe(403);
  });

  test("handler re-checks the principal → anonymous 401", async () => {
    const res = await handler()(makeCtx(null, formOf(fileOf("characters/Aria.png"))));
    expect(res.status).toBe(401);
    expect(startSpy).not.toHaveBeenCalled();
  });
});

describe("registerImportTree — fail-closed path sanitization (nothing staged, no start)", () => {
  for (const bad of ["wrap/../../etc/passwd", "/abs/characters/Aria.png", "wrap/a\\b.png", "wrap/characters/\0.png"]) {
    test(`rejects ${JSON.stringify(bad)} → 400`, async () => {
      const res = await handler()(makeCtx(OWNER, formOf(fileOf(bad))));
      expect(res.status).toBe(400);
      expect(startSpy).not.toHaveBeenCalled();
      expect(await stagedSubdirs()).toHaveLength(0);
    });
  }

  test("no files → 400", async () => {
    const res = await handler()(makeCtx(OWNER, new FormData()));
    expect(res.status).toBe(400);
    expect(startSpy).not.toHaveBeenCalled();
  });
});

describe("registerImportTree — DoS caps", () => {
  test("a file over the 64 MiB per-file cap → 413, nothing staged", async () => {
    const big = fileOf("wrap/characters/big.png", new Uint8Array(64 * 1024 * 1024 + 1));
    const res = await handler()(makeCtx(OWNER, formOf(big)));
    expect(res.status).toBe(413);
    expect(startSpy).not.toHaveBeenCalled();
    expect(await stagedSubdirs()).toHaveLength(0);
  });

  test("over the 50k file-count cap → 413 before any staging", async () => {
    const files = Array.from({ length: 50_001 }, (_, i) => fileOf(`wrap/characters/f${i}.png`));
    const res = await handler()(makeCtx(OWNER, formOf(...files)));
    expect(res.status).toBe(413);
    expect(startSpy).not.toHaveBeenCalled();
  });
});

describe("registerImportTree — layout sniff dispatch (caller-scoped ownerId)", () => {
  test("orb bundle tree → import-bundle {source:dir}, staged normalized to entity dirs at root", async () => {
    const form = formOf(fileOf("backup/characters/Aria.png"), fileOf("backup/personas/me.json"), fileOf("backup/presets/rp.json"));
    const res = await handler()(makeCtx(OWNER, form));
    expect(res.status).toBe(202);
    expect(startSpy).toHaveBeenCalledTimes(1);
    const call = startSpy.mock.calls[0]?.[0];
    expect(call?.input.kind).toBe("import-bundle");
    expect(call?.input.params["source"]).toBe("dir");
    expect(call?.ownerId).toBe(OWNER.userId);
    // The picked-folder wrapper is stripped: the staged tree has entity dirs at its root.
    const token = call?.input.params["token"] as string;
    expect(await readdir(join(ownerStagingRoot(), token))).toEqual(expect.arrayContaining(["characters", "personas", "presets"]));
    // The staged tree sits under the UPLOADER, never at the shared root.
    expect(await readdir(stagingDir)).toEqual([OWNER.userId]);
  });

  test("ST profile tree → import-st {stagedDir}, re-nested under one profile subdir", async () => {
    const form = formOf(fileOf("default-user/characters/Aria.png"), fileOf("default-user/settings.json"), fileOf("default-user/chats/Aria/2024.jsonl"));
    const res = await handler()(makeCtx(OWNER, form));
    expect(res.status).toBe(202);
    const call = startSpy.mock.calls[0]?.[0];
    expect(call?.input.kind).toBe("import-st");
    expect(call?.ownerId).toBe(OWNER.userId);
    const token = call?.input.params["stagedDir"] as string;
    // importAll walks a PARENT-of-profiles: exactly one profile subdir under the staged root.
    const roots = await readdir(join(ownerStagingRoot(), token), { withFileTypes: true });
    const dirs = roots.filter((e) => e.isDirectory());
    expect(dirs).toHaveLength(1);
    expect(await readdir(join(ownerStagingRoot(), token, dirs[0]?.name ?? ""))).toEqual(expect.arrayContaining(["characters", "settings.json", "chats"]));
  });

  test("ambiguous (orb dir + ST settings.json) → 400, nothing staged", async () => {
    const form = formOf(fileOf("wrap/personas/me.json"), fileOf("wrap/settings.json"));
    const res = await handler()(makeCtx(OWNER, form));
    expect(res.status).toBe(400);
    expect(startSpy).not.toHaveBeenCalled();
    expect(await stagedSubdirs()).toHaveLength(0);
  });

  test("unrecognized layout → 400 listing what was found", async () => {
    const res = await handler()(makeCtx(OWNER, formOf(fileOf("wrap/notes/todo.txt"))));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("unrecognized library layout");
    expect(await stagedSubdirs()).toHaveLength(0);
  });
});
