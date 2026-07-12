// entry/http/import — the bundle-upload registrar (core/Tier-5-Entry.md §layout "http/";
// export-import-portability.md §3). ONE route, the untrusted-archive ingest, WORKLOAD-BACKED (#113):
//   • POST /api/import/bundle — a portability zip → STAGED to disk → a per-owner SINGULAR `import-bundle`
//     workload → `202 { workloadId }`. The import runs OFF the request (the worker reads the staged zip →
//     `runBundleImport` over the registry), so a full all-blobs bundle never times out the HTTP upload and two
//     concurrent uploads by one owner are serialized by the workload single-active lock (409, not interleave).
//     This is the hostile-input HTTP boundary; the belts stack in this order:
//       1. AUTH FIRST — `principal === null` is a 401 BEFORE the body is ever touched (the 401-before-buffer
//          belt; an anonymous caller can never make us read an attacker-sized upload).
//       2. CSRF — a cookie-authenticated mutation without the custom header is a 403 (the spine's CSRF gate,
//          keyed on `principal.via === "cookie"` + the header; defense-in-depth over the SameSite=Lax cookie,
//          which already blocks a cross-site POST from carrying the session).
//       3. DoS cap — the raw body STREAM is written to the staging file with a running byte cap, so a
//          10 GiB upload is aborted mid-write (never fully staged) → a 413, the partial file removed. The zip
//          belt battery (zip-slip / bomb / lying-header / bad-method / ZIP64) runs LATER in the worker's
//          `extractZip`; a hostile archive fails the WORKLOAD (surfaced on the row), not the upload response.
//       4. OWNER SCOPE — the workload is started SINGULAR under `principal.userId`, so every imported row is
//          scoped to the caller (the runner threads the row owner into each descriptor's `importFile`); no
//          cross-tenant write. A second in-flight import for the same owner → 409 (the single-active lock).
//   The staged zip is owned by the workload from the START call on — the runner-env op removes it in a
//   `finally`. If staging or `start` fails BEFORE the workload owns it, the route removes it itself (no leak).

import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { DomainConflictError } from "@orb/kit/errors";
import type { Hono } from "hono";
import type { WorkloadService } from "#domain/workloads";
import { hasCsrfHeader } from "#infra/auth";
import { IMPORT_MAX_TOTAL_BYTES } from "../import";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;
const ACCEPTED = 202;
const BUNDLE_ROUTE = "/api/import/bundle";

/** The bundle-upload registrar's deps: the `start` verb the route enqueues the `import-bundle` workload through,
 *  plus the controlled staging root the uploaded zip is written to (the `IMPORT_STAGING_DIR` boot-env — absent ⇒
 *  the OS temp dir, the SAME default the runner-env op resolves, so the worker reads exactly where we wrote). */
export interface ImportBundleDeps {
  readonly workloads: Pick<WorkloadService, "start">;
  readonly stagingDir?: string;
}

/** The request-context shape `app.ts` populates: the resolved caller (or `null` when anonymous). */
interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** Write the upload stream to `path`, aborting (returning `false`) the instant it exceeds `maxBytes` — a bundle
 *  over the cap is never fully staged. Returns `true` on a fully-written file within the cap. */
async function stageCapped(
  body: ReadableStream<Uint8Array>,
  path: string,
  maxBytes: number,
): Promise<boolean> {
  const handle = await open(path, "w");
  const reader = body.getReader();
  let total = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: streaming the upload chunk-by-chunk to disk IS the sequential work — buffering the whole (capped) body first defeats the DoS bound.
      const { done, value } = await reader.read();
      if (done) {
        return true;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return false;
      }
      // biome-ignore lint/performance/noAwaitInLoops: each chunk is appended in order (a stream write, not a parallelizable batch).
      await handle.write(value);
    }
  } finally {
    await handle.close();
  }
}

/** Register `POST /api/import/bundle` on `app`. Auth-first, CSRF-guarded, DoS-capped; stages the upload +
 *  starts a per-owner `import-bundle` workload, returning `202 { workloadId }`. */
export function registerImportBundle(app: Hono<PrincipalEnv>, deps: ImportBundleDeps): void {
  app.post(BUNDLE_ROUTE, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      // 401 BEFORE reading the body — an anonymous caller cannot make us buffer an attacker-sized upload.
      return c.body(null, UNAUTHORIZED);
    }
    // CSRF: a cookie session mutation must carry the custom header (a cross-site page cannot set it without a
    // CORS preflight the app never grants). Non-cookie principals (header/fallback) are not CSRF-eligible.
    if (principal.via === "cookie" && !hasCsrfHeader(c.req.raw.headers)) {
      return c.body(null, FORBIDDEN);
    }
    const body = c.req.raw.body;
    if (body === null) {
      return c.json({ error: "empty request body — expected a zip bundle" }, BAD_REQUEST);
    }

    // Stage the upload to disk under the controlled root (the token names the file the worker will read back).
    const stagingRoot = deps.stagingDir ?? tmpdir();
    await mkdir(stagingRoot, { recursive: true });
    const token = `import-bundle-${randomUUID()}.zip`;
    const stagedPath = join(stagingRoot, token);
    const staged = await stageCapped(body, stagedPath, IMPORT_MAX_TOTAL_BYTES);
    if (!staged) {
      await rm(stagedPath, { force: true });
      return c.json({ error: "bundle exceeds the maximum upload size" }, PAYLOAD_TOO_LARGE);
    }

    // Hand the staged zip to a SINGULAR per-owner workload; from here the workload owns the file (its runner-env
    // op cleans it up). A pre-dispatch failure (e.g. the single-active lock) leaves no consumer → remove it here.
    try {
      const { id } = await deps.workloads.start({
        input: { kind: "import-bundle", params: { token } },
        caller: principal,
        mode: "singular",
        ownerId: principal.userId,
      });
      return c.json({ workloadId: id }, ACCEPTED);
    } catch (err) {
      await rm(stagedPath, { force: true });
      if (err instanceof DomainConflictError) {
        return c.json({ error: "a bundle import is already running for this account" }, CONFLICT);
      }
      throw err; // an unexpected error → the app onError 500.
    }
  });
}
