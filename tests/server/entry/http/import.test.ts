// entry/http/import — the bundle-upload registrar, an INGEST TRUST BOUNDARY with no middleware to hide
// behind: unlike its three sibling ingest routes (`upload.ts` / `import-tree.ts` / `import-chat.ts`, which
// mount `[authCsrfGuard, bodyCap, handler]`), this route reads `c.req.raw.body` as a raw stream and carries
// ALL FOUR belts INLINE in one handler. Nothing tested them. This file pins each belt at its refusal:
//
//   auth  — anonymous → 401 BEFORE the body is touched (asserted by instrumenting `raw.body` as a getter:
//           an auth check moved below the read would leak an un-authenticated stream onto disk).
//   CSRF  — every AMBIENT-credential arm (`via !== "header"`: cookie AND the loopback owner fallback, the
//           #300 class) must present the CSRF header; a bearer/header caller is exempt because its
//           credential is not ambient. This route is CORS-"simple" (raw stream, no Content-Type read), so
//           there is no preflight and the header IS the gate.
//   DoS   — a body over `IMPORT_MAX_TOTAL_BYTES` aborts mid-stream → 413, and the partially-staged file is
//           REMOVED (a refused upload must not leave a zip on the box's disk).
//   scope — the workload is started with the CALLER's own `ownerId` and `caller`, and with a
//           SERVER-MINTED token: nothing the requester sent reaches the staging path or the owner field.
//
// Plus the two failure exits that own the staged file: a `DomainConflictError` (the single-active lock) is
// mapped to 409 and an unexpected error is re-thrown — both after removing the staged zip, because the
// workload only takes ownership of it from a successful `start` on.
//
// Hono is not test-resolvable, so the registrar runs over a captured mock app + ctx — the same seam
// upload.test / import-tree.test use.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { DomainConflictError } from "@orb/kit/errors";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportBundleDeps } from "@orb/server/entry/http";
import { registerImportBundle } from "@orb/server/entry/http";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const BUNDLE_ROUTE = "POST /api/import/bundle";

const HEADER_USER: Principal = {
  userId: castId<UserId>("usr_importer"),
  role: "user",
  handle: castId<Handle>("importer"),
  externalId: null,
  via: "header",
};
const COOKIE_USER: Principal = { ...HEADER_USER, via: "cookie" };
const FALLBACK_OWNER: Principal = { ...HEADER_USER, userId: castId<UserId>("usr_owner"), role: "owner", via: "fallback" };

interface RawReq {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly headers: Headers;
}
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: null, status?: number) => Response;
  readonly req: { readonly raw: RawReq };
}
type Handler = (c: MockCtx) => Promise<Response> | Response;

/** A stream of the given chunks. Each `read()` yields one chunk; the cap belt sums their byteLengths. */
function streamOf(...chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      const chunk = chunks[i];
      i += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/** Records whether the handler ever READ `req.raw.body` — the auth-before-the-body receipt. */
interface BodyProbe {
  readonly ctx: MockCtx;
  readonly touched: () => boolean;
}

function makeCtx(principal: Principal | null, body: ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}): BodyProbe {
  let touched = false;
  const raw: RawReq = {
    get body(): ReadableStream<Uint8Array> | null {
      touched = true;
      return body;
    },
    headers: new Headers(headers),
  };
  const ctx: MockCtx = {
    get: (key): Principal | null => (key === "principal" ? principal : null),
    json: (payload: unknown, status = 200): Response => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
    body: (data: null, status = 200): Response => new Response(data, { status }),
    req: { raw },
  };
  return { ctx, touched: (): boolean => touched };
}

let stagingDir: string;
const startSpy =
  vi.fn<
    (p: {
      input: { kind: string; params: Record<string, unknown> };
      caller: Principal | null;
      mode: string;
      ownerId: UserId | null;
    }) => Promise<{ id: WorkloadId }>
  >();

function deps(): ImportBundleDeps {
  // @orb-waive no-test-fabrication(ImportBundleDeps["workloads"]): the route needs exactly `workloads.start`; `Pick<WorkloadService,"start">` is satisfied structurally by the spy. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { workloads: { start: startSpy } as ImportBundleDeps["workloads"], stagingDir };
}

/** Capture the belt chain the registrar mounts on the bundle route. */
function chain(): Handler[] {
  const routes = new Map<string, Handler[]>();
  const app = {
    post: (path: string, ...handlers: Handler[]): unknown => {
      routes.set(`POST ${path}`, handlers);
      return app;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerImportBundle(app as unknown as Parameters<typeof registerImportBundle>[0], deps());
  const captured = routes.get(BUNDLE_ROUTE);
  if (captured === undefined) {
    throw new Error("bundle route not registered");
  }
  return captured;
}

function handler(): Handler {
  const h = chain().at(-1);
  if (h === undefined) {
    throw new Error("no handler");
  }
  return h;
}

/** The uploader OWN staging subdir (#1534) - the route stages under root/userId, so the belts
 *  "was it removed?" receipts read there. An absent subdir means nothing was ever staged. */
async function stagedFiles(userId: UserId = HEADER_USER.userId): Promise<string[]> {
  return await readdir(join(stagingDir, userId)).catch(() => []);
}

beforeEach(async () => {
  stagingDir = await mkdtemp(join(tmpdir(), "orb-bundle-test-"));
  startSpy.mockReset();
  startSpy.mockResolvedValue({ id: castId<WorkloadId>("workload_bundle_1") });
});

afterEach(async () => {
  await rm(stagingDir, { recursive: true, force: true });
});

describe("registerImportBundle — the belts are INLINE (no middleware carries them)", () => {
  test("mounts exactly ONE handler: every belt is this handler's own", () => {
    expect(chain()).toHaveLength(1);
  });

  test("anonymous → 401 and the request body is NEVER read (auth precedes the stream)", async () => {
    const probe = makeCtx(null, streamOf(new Uint8Array([1, 2, 3])));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(401);
    expect(probe.touched()).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();
    expect(await stagedFiles()).toEqual([]);
  });
});

describe("registerImportBundle — CSRF gates every AMBIENT credential (#300: cookie AND the owner fallback)", () => {
  test("a COOKIE session without the CSRF header → 403, body untouched", async () => {
    const probe = makeCtx(COOKIE_USER, streamOf(new Uint8Array([1])));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(403);
    expect(probe.touched()).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();
  });

  test("the loopback OWNER FALLBACK without the CSRF header → 403 (its credential is ambient too)", async () => {
    const probe = makeCtx(FALLBACK_OWNER, streamOf(new Uint8Array([1])));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(403);
    expect(startSpy).not.toHaveBeenCalled();
  });

  test("a cookie session WITH the CSRF header proceeds (the header is what lifts the ambient-credential gate)", async () => {
    const probe = makeCtx(COOKIE_USER, streamOf(new Uint8Array([1, 2, 3])), { [CSRF_HEADER]: "1" });

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(202);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  test("a HEADER (non-ambient) credential needs no CSRF header", async () => {
    const probe = makeCtx(HEADER_USER, streamOf(new Uint8Array([1, 2, 3])));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(202);
  });
});

describe("registerImportBundle — the DoS byte cap (a refused upload leaves nothing on disk)", () => {
  test("a body over IMPORT_MAX_TOTAL_BYTES → 413, no workload, and the partial staging file is removed", async () => {
    // ONE chunk one byte over the 256 MiB cap: `stageCapped` sums BEFORE it writes, so this trips the belt
    // without ever putting 256 MiB on disk. (The exactly-at-cap arm is deliberately not exercised — it would
    // write a real 256 MiB file in the suite; the boundary itself is `total > maxBytes`, read above.)
    const probe = makeCtx(HEADER_USER, streamOf(new Uint8Array(IMPORT_MAX_TOTAL_BYTES + 1)));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(413);
    expect(startSpy).not.toHaveBeenCalled();
    // `open(path,"w")` created the file before the first read; the refusal path must `rm` it.
    expect(await stagedFiles()).toEqual([]);
  });

  test("a multi-chunk body that only crosses the cap LATE is still refused (the cap is a running total)", async () => {
    const half = new Uint8Array(Math.floor(IMPORT_MAX_TOTAL_BYTES / 2) + 1);
    const probe = makeCtx(HEADER_USER, streamOf(half, half));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(413);
    expect(await stagedFiles()).toEqual([]);
  });

  test("an absent body → 400 before any staging", async () => {
    const probe = makeCtx(HEADER_USER, null);

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(400);
    expect(startSpy).not.toHaveBeenCalled();
    expect(await stagedFiles()).toEqual([]);
  });
});

describe("registerImportBundle — owner scoping + the server-minted staging token", () => {
  test("starts a singular import-bundle workload as the CALLER, owned by the caller, on a staged file", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]);
    const probe = makeCtx(HEADER_USER, streamOf(bytes));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(202);
    expect(await res.json()).toStrictEqual({ workloadId: "workload_bundle_1" });

    const call = startSpy.mock.calls[0]?.[0];
    expect(call?.input.kind).toBe("import-bundle");
    expect(call?.mode).toBe("singular");
    // The owner is the request's resolved Principal — never a body/param value, so one account can never
    // stage an import into another's library.
    expect(call?.ownerId).toBe(HEADER_USER.userId);
    expect(call?.caller).toBe(HEADER_USER);

    // The token names a file that actually exists under the staging dir, and it is server-minted: the
    // caller contributes no byte of the path.
    const token = call?.input.params["token"];
    expect(typeof token).toBe("string");
    expect(await stagedFiles()).toEqual([token]);
    expect(String(token)).toMatch(/^import-bundle-[0-9a-f-]{36}\.zip$/u);
  });

  // #1534 — the staging namespace is PER-UPLOADER, and that is what makes the handle safe to hand out: the
  // import contribution re-derives the same subdir from ITS row's owner, so a second account naming this
  // token resolves a path that does not exist under its own root. Nothing lands at the bare staging root.
  test("the staged file lands under the UPLOADER's own subdir, never at the shared root", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await handler()(makeCtx(HEADER_USER, streamOf(bytes)).ctx);
    const token = startSpy.mock.calls[0]?.[0]?.input.params["token"];

    expect(await readdir(stagingDir)).toEqual([HEADER_USER.userId]);
    expect(await readdir(join(stagingDir, HEADER_USER.userId))).toEqual([token]);

    // A DIFFERENT principal's upload lands in a DIFFERENT subdir — two accounts never share a directory.
    startSpy.mockResolvedValue({ id: castId<WorkloadId>("workload_bundle_2") });
    await handler()(makeCtx(FALLBACK_OWNER, streamOf(bytes), { [CSRF_HEADER]: "1" }).ctx);
    const otherToken = startSpy.mock.calls[1]?.[0]?.input.params["token"];
    expect((await readdir(stagingDir)).sort()).toEqual([HEADER_USER.userId, FALLBACK_OWNER.userId].sort());
    expect(await readdir(join(stagingDir, FALLBACK_OWNER.userId))).toEqual([otherToken]);
  });

  test("two uploads mint DISTINCT tokens (no fixed path a second caller could race or overwrite)", async () => {
    const h = handler();
    await h(makeCtx(HEADER_USER, streamOf(new Uint8Array([1]))).ctx);
    startSpy.mockResolvedValue({ id: castId<WorkloadId>("workload_bundle_2") });
    await h(makeCtx(HEADER_USER, streamOf(new Uint8Array([2]))).ctx);

    const first = startSpy.mock.calls[0]?.[0]?.input.params["token"];
    const second = startSpy.mock.calls[1]?.[0]?.input.params["token"];
    expect(first).not.toBe(second);
    expect((await stagedFiles()).sort()).toEqual([first, second].sort());
  });
});

describe("registerImportBundle — the staged zip is owned by the workload only from a successful start", () => {
  test("the single-active lock (DomainConflictError) → 409 and the staged file is removed", async () => {
    startSpy.mockRejectedValue(new DomainConflictError("workload already running"));
    const probe = makeCtx(HEADER_USER, streamOf(new Uint8Array([1, 2, 3])));

    const res = await handler()(probe.ctx);

    expect(res.status).toBe(409);
    expect(await stagedFiles()).toEqual([]);
  });

  test("an UNEXPECTED start failure re-throws (never a silent 202) and still removes the staged file", async () => {
    startSpy.mockRejectedValue(new Error("db is on fire"));
    const probe = makeCtx(HEADER_USER, streamOf(new Uint8Array([1, 2, 3])));

    await expect(handler()(probe.ctx)).rejects.toThrow("db is on fire");
    expect(await stagedFiles()).toEqual([]);
  });
});
