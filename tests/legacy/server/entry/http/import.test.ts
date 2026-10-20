// entry/http/import — the bundle-upload registrar, an INGEST TRUST BOUNDARY with no middleware to hide
// behind: unlike its three sibling ingest routes (`upload.ts` / `import-tree.ts` / `import-chat.ts`, which
// mount `[authCsrfGuard, bodyCap, handler]`), this route reads `c.req.raw.body` as a raw stream and carries
// ALL FOUR belts INLINE in one handler. This file pins the inline shape and the auth belt:
//
//   auth  — anonymous → 401 BEFORE the body is touched (asserted by instrumenting `raw.body` as a getter:
//           an auth check moved below the read would leak an un-authenticated stream onto disk).
//
// The other belts run over real credentials: CSRF by credential in tests/e2e/csrf-gates.local.spec.ts and
// tests/e2e/csrf-gates.forward.spec.ts; the byte cap, the empty body and the 409 lock in
// tests/server/entry/http/bundle-body-limit.int.test.ts; uploader-owned staging, server-minted tokens and the
// start-failure cleanup in tests/server/entry/http/portability-routes.int.test.ts.
//
// Hono is not test-resolvable, so the registrar runs over a captured mock app + ctx — the same seam
// upload.test / import-tree.test use.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { WorkloadRef } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { afterEach, beforeEach, describe, vi } from "vitest";
import type { ImportBundleDeps } from "#server/entry/http/index.ts";
import { registerImportBundle } from "#server/entry/http/index.ts";

const BUNDLE_ROUTE = "POST /api/import/bundle";

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

/** A stream of the given chunks. Each `read()` yields one chunk. */
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

function makeCtx(principal: Principal | null, body: ReadableStream<Uint8Array> | null): BodyProbe {
  let touched = false;
  const raw: RawReq = {
    get body(): ReadableStream<Uint8Array> | null {
      touched = true;
      return body;
    },
    headers: new Headers(),
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
    (p: { input: { kind: string; params: Record<string, unknown> }; caller: Principal | null; mode: string; ownerId: UserId | null }) => Promise<WorkloadRef>
  >();

function deps(): ImportBundleDeps {
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
    expect(await readdir(stagingDir)).toEqual([]);
  });
});
