// The bundle-upload registrar. One route, workload-backed: POST /api/import/bundle stages a portability
// zip to disk, then starts a per-owner singular import-bundle workload (202 {workloadId}) — the import
// runs off the request, so a full bundle never times out the HTTP upload, and concurrent uploads by one
// owner are serialized by the workload single-active lock (409). Belt order: auth (401 before the body is
// touched) → CSRF → a DoS byte cap on the staging write (413, partial file removed) → owner-scoped start.
// The staged zip is owned by the workload from `start` on (its runner-env op cleans it up in a finally);
// a pre-dispatch failure removes it here instead.

import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainConflictError } from "@orb/kit/errors";
import type { Hono } from "hono";
import type { WorkloadService } from "#domain/workloads";
import { hasCsrfHeader } from "#infra/auth";
import { IMPORT_MAX_TOTAL_BYTES } from "../import/index.ts";
import type { PrincipalEnv } from "./blob.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;
const ACCEPTED = 202;
const BUNDLE_ROUTE = "/api/import/bundle";

export interface ImportBundleDeps {
  readonly workloads: Pick<WorkloadService, "start">;
  readonly stagingDir?: string;
}

/** Write the upload stream to `path`, aborting (returning `false`) the instant it exceeds `maxBytes`.
 *  O_CREAT|O_EXCL|O_NOFOLLOW (the flags the zip + folder-tree stagers already carry): a staged upload is
 *  always a fresh regular file, so nothing our own writers put under the staging root can be a symlink for
 *  the import contribution's containment belt to meet. The default root is the OS temp dir. */
async function stageCapped(body: ReadableStream<Uint8Array>, path: string, maxBytes: number): Promise<boolean> {
  // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the sibling staging writers carry the same exemption).
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW);
  const reader = body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return true;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return false;
      }
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
      return c.body(null, UNAUTHORIZED);
    }
    // CSRF keys on the ambient-credential arms `via !== "header"` (cookie + the loopback owner fallback) — this
    // route reads `c.req.raw.body` as a raw stream and never checks Content-Type, so it is CORS-"simple" with no
    // preflight (the #300 class); the peer gate alone still leaves a loopback web origin able to drive an owner
    // bundle write. See upload.ts's authCsrfGuard WHY-block; the three sibling ingest routes gate this identically.
    if (principal.via !== "header" && !hasCsrfHeader(c.req.raw.headers)) {
      return c.body(null, FORBIDDEN);
    }
    const body = c.req.raw.body;
    if (body === null) {
      return c.json({ error: "empty request body — expected a zip bundle" }, BAD_REQUEST);
    }

    const stagingRoot = deps.stagingDir ?? tmpdir();
    await mkdir(stagingRoot, { recursive: true });
    const token = `import-bundle-${randomUUID()}.zip`;
    const stagedPath = join(stagingRoot, token);
    const staged = await stageCapped(body, stagedPath, IMPORT_MAX_TOTAL_BYTES);
    if (!staged) {
      await rm(stagedPath, { force: true });
      return c.json({ error: "bundle exceeds the maximum upload size" }, PAYLOAD_TOO_LARGE);
    }

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
      throw err;
    }
  });
}
