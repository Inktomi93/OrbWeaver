// entry/http — the portability ROUTE transport tests (audit G-8): the GET /api/export/library +
// POST /api/import/bundle registrars, driven over the REAL injected registry (`app.portability`, all 10
// descriptors) + REAL domain services + a fresh migrated db. Pins the transport-shape behavior gates cannot
// see: anon → 401 before any read; a bad `kinds` token → 400; the streamed library zip carries the seeded
// entities' DIRECTORIES; a `?kinds=` filter narrows to those dirs; a re-uploaded library bundle imports the
// ROWS for the uploading owner (the round-trip through the actual HTTP handlers, not the layers below).

import type { Principal } from "@orb/contracts/identity";
import { presets, tags, themes } from "@orb/db";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { loadWorkload, runWorkload } from "@orb/server/domain/workloads";
import type { ExportDeps, ImportBundleDeps } from "@orb/server/entry/http";
import { registerExport, registerImportBundle } from "@orb/server/entry/http";
import { extractZip } from "@orb/server/infra/storage";
import { and, eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { loadRunnableWorkload, makeRunnerDeps } from "../../domain/workloads/_support.ts";

// The portability route suite builds the full service graph + drives a real `import-bundle` workload; it
// passes warm in ~2-3 s but exceeds vitest's 5 s default under parallel CPU contention. A generous per-suite
// timeout keeps CI green on scheduling jitter, not real work.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const OWNER_ID = castId<UserId>("user_portability_owner");
const TARGET_ID = castId<UserId>("user_portability_target");

function principalOf(userId: UserId, via: Principal["via"] = "header"): Principal {
  return { userId, role: "owner", handle: castId<Handle>(userId), externalId: null, via };
}

// ── A minimal Hono-shape mock: the registrars capture their handler on `get`/`post`; the handler runs over a
//    context stub carrying the resolved principal + the request shape each route reads. ────────────────────
type Handler = (c: MockCtx) => Promise<Response> | Response;
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly req: {
    readonly query: (name: string) => string | undefined;
    readonly raw: Request;
  };
}

function captureExport(deps: ExportDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, h: Handler): unknown => {
      routes.set(`GET ${path}`, h);
      return app;
    },
  };
  // FABRICATION-OK: narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value.
  registerExport(app as unknown as Parameters<typeof registerExport>[0], deps);
  return routes;
}

function captureImport(deps: ImportBundleDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const app = {
    post: (path: string, h: Handler): unknown => {
      routes.set(`POST ${path}`, h);
      return app;
    },
  };
  // FABRICATION-OK: narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value.
  registerImportBundle(app as unknown as Parameters<typeof registerImportBundle>[0], deps);
  return routes;
}

function makeCtx(principal: Principal | null, opts: { readonly query?: Record<string, string>; readonly raw?: Request } = {}): MockCtx {
  return {
    get: (key): Principal | null => (key === "principal" ? principal : null),
    json: (b, status = 200): Response => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }),
    body: (data, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: {
      query: (name): string | undefined => opts.query?.[name],
      raw: opts.raw ?? new Request("http://t/api/import/bundle", { method: "POST" }),
    },
  };
}

/** Every path in a zip byte buffer (extracted through the REAL belt battery). */
async function zipPaths(bytes: Uint8Array): Promise<string[]> {
  const staged = await extractZip(bytes);
  try {
    return staged.entries.map((e) => e.path);
  } finally {
    await staged.dispose();
  }
}

describe("portability routes — GET /api/export/library + POST /api/import/bundle over the real registry", () => {
  test("library route: anon → 401; bad kinds token → 400; the streamed zip carries the seeded entity dirs", async ({ db, app }) => {
    await seedUser(db, { id: OWNER_ID, handle: castId<Handle>("portability-owner") });
    const owner = principalOf(OWNER_ID);
    // Seed two self-contained entities (no CAS needed) — enough to prove a MULTI-entity library zip.
    await app.services.preset.create({ userId: OWNER_ID, name: "My Preset", kind: "roleplay" });
    await app.services.tag.createTag({ principal: owner, input: { name: "adventure" } });

    const routes = captureExport({ export: app.exportService, registry: app.portability });
    const handler = routes.get("GET /api/export/library");
    if (handler === undefined) {
      throw new Error("library route not registered");
    }

    // anon → 401 (before any read).
    expect((await handler(makeCtx(null))).status).toBe(401);
    // an unknown kind token → 400.
    expect((await handler(makeCtx(owner, { query: { kinds: "not-a-kind" } }))).status).toBe(400);

    // the full library zip carries BOTH entity dirs.
    const full = await handler(makeCtx(owner));
    expect(full.headers.get("Content-Type")).toBe("application/zip");
    const paths = await zipPaths(new Uint8Array(await full.arrayBuffer()));
    expect(paths.some((p) => p.startsWith("presets/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("tags/"))).toBe(true);

    // a `?kinds=preset` filter narrows the zip to the presets dir only.
    const filtered = await handler(makeCtx(owner, { query: { kinds: "preset" } }));
    const filteredPaths = await zipPaths(new Uint8Array(await filtered.arrayBuffer()));
    expect(filteredPaths.some((p) => p.startsWith("presets/"))).toBe(true);
    expect(filteredPaths.some((p) => p.startsWith("tags/"))).toBe(false);
  });

  test("bundle route: a library zip → import writes the ROWS for the uploading owner", async ({ db, app }): Promise<void> => {
    await seedUser(db, { id: OWNER_ID, handle: castId<Handle>("portability-owner") });
    await seedUser(db, { id: TARGET_ID, handle: castId<Handle>("portability-target") });
    const owner = principalOf(OWNER_ID);
    const target = principalOf(TARGET_ID);

    await app.services.preset.create({ userId: OWNER_ID, name: "Shared Preset", kind: "roleplay" });
    await app.services.tag.createTag({ principal: owner, input: { name: "shared-tag" } });
    await app.services.settings.createTheme({
      principal: owner,
      input: { name: "Shared Theme", override: {}, css: null },
    });

    // Export the owner's full library through the real library route.
    const exportRoutes = captureExport({ export: app.exportService, registry: app.portability });
    const exportHandler = exportRoutes.get("GET /api/export/library");
    if (exportHandler === undefined) {
      throw new Error("library route not registered");
    }
    const zip = new Uint8Array(await (await exportHandler(makeCtx(owner))).arrayBuffer());

    // Upload the SAME zip to the bundle route AS THE TARGET owner (header principal → CSRF gate inert). The
    // route is WORKLOAD-BACKED: it stages the zip + starts a SINGULAR `import-bundle` run (202 {workloadId});
    // the import runs when the worker drives the row. Drive it here (runWorkload over the REAL runner-env,
    // whose `importBundle` op reads the staged zip from the same OS-temp staging root the route wrote to).
    const importRoutes = captureImport({ workloads: app.services.workloads });
    const importHandler = importRoutes.get("POST /api/import/bundle");
    if (importHandler === undefined) {
      throw new Error("bundle route not registered");
    }
    const runImport = async (): Promise<{ imported: number; skipped: number; failed: number }> => {
      const req = new Request("http://t/api/import/bundle", { method: "POST", body: zip });
      const res = await importHandler(makeCtx(target, { raw: req }));
      expect(res.status).toBe(202);
      const { workloadId } = (await res.json()) as { workloadId: WorkloadId };
      const row = await loadRunnableWorkload(db, app.workloadContributions, workloadId);
      await runWorkload(makeRunnerDeps(db, app.workloadContributions), row, new AbortController().signal);
      const done = await loadWorkload(db, app.workloadContributions, workloadId);
      expect(done?.status).toBe("succeeded");
      return done?.result as { imported: number; skipped: number; failed: number };
    };
    const report = await runImport();
    expect(report.failed).toBe(0);
    expect(report.imported).toBeGreaterThanOrEqual(3);

    // The rows landed under the TARGET owner (owner-scoped writes; the bundle threaded target.userId).
    const targetPresets = await db
      .select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.ownerId, TARGET_ID), eq(presets.name, "Shared Preset")));
    expect(targetPresets).toHaveLength(1);
    const targetTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.ownerId, TARGET_ID), eq(tags.name, "shared-tag")));
    expect(targetTags).toHaveLength(1);
    const targetThemes = await db
      .select({ id: themes.id })
      .from(themes)
      .where(and(eq(themes.ownerId, TARGET_ID), eq(themes.name, "Shared Theme")));
    expect(targetThemes).toHaveLength(1);

    // Idempotent re-import: a second upload of the same bundle writes ZERO new rows.
    const report2 = await runImport();
    expect(report2.failed).toBe(0);
    const presetsAfter = await db.select({ id: presets.id }).from(presets).where(eq(presets.ownerId, TARGET_ID));
    expect(presetsAfter).toHaveLength(1);
  });
});
