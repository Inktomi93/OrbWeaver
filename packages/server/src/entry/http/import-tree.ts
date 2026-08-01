// The folder-upload ingest registrar — the Backup & Restore pane's directory-import seam and an INGEST TRUST
// BOUNDARY: the browser posts a multipart batch where each part's filename is its `webkitRelativePath`
// (browser-supplied, HOSTILE). POST /api/import/tree sanitizes every relative path FAIL-CLOSED, stages the
// batch into a fresh unique dir under the staging root, sniffs the tree layout, and enqueues the matching
// per-owner import workload (import-st for a SillyTavern profile tree, import-bundle for an orb backup tree),
// replying 202 {workloadId}. The workload owns the staged tree's cleanup (its runner-env op removes it in a
// finally), mirroring the staged-zip path.
//
// Belt order mirrors the sibling upload routes: auth (401 before the body is read) → CSRF (403 on a cookie
// mutation missing the custom header) → a hono/body-limit total-bytes cap (413) → per-file + count caps
// (413) → fail-closed path sanitization (400, WHOLE upload rejected, nothing staged) → resolve-escape check
// (never trust string filtering alone) → layout sniff (400 on an unrecognized/ambiguous tree) → owner-scoped
// start. Every rejection is typed; a rejected path or a cap breach fails the WHOLE upload (no partial staging).

import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { DomainConflictError } from "@orb/kit/errors";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WorkloadService } from "#domain/workloads";
import { hasCsrfHeader } from "#infra/auth";
import { sniffTreeLayout } from "../import";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;
const ACCEPTED = 202;
const TREE_ROUTE = "/api/import/tree";
const UPLOAD_FIELD = "file";

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
// Total batch cap — the DoS ceiling on the whole multipart body (formData buffers it), matching the
// compressed-bundle route's 256 MiB (a larger library must use the .zip path, which streams to disk).
const TREE_MAX_TOTAL_MIB = 256;
const TREE_MAX_TOTAL_BYTES = TREE_MAX_TOTAL_MIB * BYTES_PER_MIB;
// Per-file cap — the same per-blob bound the PD-94 asset store + the zip per-entry belt enforce (64 MiB).
const TREE_MAX_FILE_MIB = 64;
const TREE_MAX_FILE_BYTES = TREE_MAX_FILE_MIB * BYTES_PER_MIB;
// File-count ceiling — the zip extractor's per-archive entry cap (50k); the collect.ts MAX_DIR_ENTRIES (100k)
// is the loop-guard shape, this is the route-level DoS bound on a single upload.
const TREE_MAX_FILES = 50_000;

const DRIVE_LETTER = /^[a-zA-Z]:/;
const TRAILING_SLASH = /\/$/;
const ST_SHARED_DIRS = new Set(["characters/", "chats/"]);

export interface ImportTreeDeps {
  readonly workloads: Pick<WorkloadService, "start">;
  /** The portability registry — its entity-dir names (minus the ST-shared ones) are the positive orb signal. */
  readonly registry: PortabilityRegistry;
  readonly stagingDir?: string;
}

interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** One accepted multipart part: its browser-supplied relative path + the bytes. */
interface UploadPart {
  readonly relPath: string;
  readonly bytes: Uint8Array;
}

/** The two client-error statuses a fail-closed rejection can carry (literal union so `c.json` accepts it). */
type RejectStatus = typeof BAD_REQUEST | typeof PAYLOAD_TOO_LARGE;

/** A fail-closed rejection: nothing was staged, the whole upload fails with this typed reason + status. */
class TreeRejected extends Error {
  readonly status: RejectStatus;
  constructor(status: RejectStatus, message: string, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
    this.name = "TreeRejected";
  }
}

/** Auth-first + CSRF gate, run BEFORE the body-limit belt so an anonymous/cross-site caller is rejected
 *  before a single body byte is read (identical to the sibling upload routes' guard). */
const authCsrfGuard: MiddlewareHandler<PrincipalEnv> = async (c, next) => {
  const principal = c.get("principal");
  if (principal === null) {
    return c.body(null, UNAUTHORIZED);
  }
  if (principal.via === "cookie" && !hasCsrfHeader(c.req.raw.headers)) {
    return c.body(null, FORBIDDEN);
  }
  return await next();
};

function bodyCap(maxBytes: number): ReturnType<typeof bodyLimit> {
  return bodyLimit({ maxSize: maxBytes, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) });
}

/**
 * Fail-closed sanitization of ONE browser-supplied relative path. Rejects absolute paths, drive letters,
 * backslashes (a legit `webkitRelativePath` is forward-slashed — a backslash is normalized to a reject, the
 * same call the zip belt's `assertSafeName` makes), NUL bytes, and empty / `.` / `..` segments. Returns the
 * path unchanged; the resolve-prefix check at stage time is the second, authoritative belt.
 */
function sanitizeRelPath(raw: string): string {
  if (raw.length === 0) {
    throw new TreeRejected(BAD_REQUEST, "empty file path");
  }
  if (raw.includes("\0")) {
    throw new TreeRejected(BAD_REQUEST, "file path contains a NUL byte");
  }
  if (raw.includes("\\")) {
    throw new TreeRejected(BAD_REQUEST, `file path uses a backslash separator: ${raw}`);
  }
  if (raw.startsWith("/")) {
    throw new TreeRejected(BAD_REQUEST, `absolute file path: ${raw}`);
  }
  if (DRIVE_LETTER.test(raw)) {
    throw new TreeRejected(BAD_REQUEST, `drive-lettered file path: ${raw}`);
  }
  for (const segment of raw.split("/")) {
    if (segment.length === 0) {
      throw new TreeRejected(BAD_REQUEST, `empty path segment in: ${raw}`);
    }
    if (segment === "." || segment === "..") {
      throw new TreeRejected(BAD_REQUEST, `traversing / dot path segment in: ${raw}`);
    }
  }
  return raw;
}

/** The single leading path segment shared by EVERY path (the browser's picked-folder wrapper), or null if the
 *  paths don't share one. Stripped so the layout sniff + staging see the picked folder's CONTENTS. */
function commonWrapper(paths: readonly string[]): string | null {
  const [first] = paths;
  if (first === undefined) {
    return null;
  }
  const slash = first.indexOf("/");
  if (slash === -1) {
    return null;
  }
  const wrapper = first.slice(0, slash);
  const prefix = `${wrapper}/`;
  return paths.every((p) => p.startsWith(prefix)) ? wrapper : null;
}

function stripWrapper(path: string, wrapper: string | null): string {
  return wrapper !== null ? path.slice(wrapper.length + 1) : path;
}

/** Registry entity dirs minus the ST-shared `characters/`/`chats/`, as bare segment names — the orb signal. */
function orbOnlyDirNames(registry: PortabilityRegistry): Set<string> {
  const names = new Set<string>();
  for (const entity of registry) {
    if (!ST_SHARED_DIRS.has(entity.dir)) {
      names.add(entity.dir.replace(TRAILING_SLASH, ""));
    }
  }
  return names;
}

/** Collect + validate the multipart parts fail-closed: count, per-file bytes, path sanitization. Throws
 *  {@link TreeRejected} (nothing staged) on the first breach. */
async function collectParts(form: FormData): Promise<UploadPart[]> {
  const files = form.getAll(UPLOAD_FIELD).filter((e): e is File => e instanceof File);
  if (files.length === 0) {
    throw new TreeRejected(BAD_REQUEST, `no "${UPLOAD_FIELD}" uploads`);
  }
  if (files.length > TREE_MAX_FILES) {
    throw new TreeRejected(PAYLOAD_TOO_LARGE, `too many files (over ${TREE_MAX_FILES})`);
  }
  const parts: UploadPart[] = [];
  for (const file of files) {
    if (file.size > TREE_MAX_FILE_BYTES) {
      throw new TreeRejected(PAYLOAD_TOO_LARGE, `"${file.name}" exceeds the ${TREE_MAX_FILE_MIB} MiB per-file cap`);
    }
    const relPath = sanitizeRelPath(file.name);
    // biome-ignore lint/performance/noAwaitInLoops: parts are read sequentially — the batch is already bounded by the count + per-file + total-body caps.
    parts.push({ relPath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return parts;
}

/** O_CREAT | O_EXCL | O_NOFOLLOW: never open an existing path or follow a symlink — a staged file is always a
 *  fresh write (mirrors the zip staging writer). */
async function writeStaged(path: string, bytes: Uint8Array): Promise<void> {
  const flags =
    // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the zip staging writer carries the same exemption).
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  const handle = await open(path, flags);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

/** Write one part under `stagedRoot` at `relTarget`. Resolves the final path and prefix-checks it against
 *  `stagedRoot` (the authoritative escape belt — never trust the string filter alone), then writes it. */
async function stagePart(stagedRoot: string, relTarget: string, bytes: Uint8Array): Promise<void> {
  const target = resolve(stagedRoot, relTarget);
  if (target !== stagedRoot && !target.startsWith(stagedRoot + sep)) {
    throw new TreeRejected(BAD_REQUEST, `file path escapes the staging root: ${relTarget}`);
  }
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeStaged(target, bytes);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR") {
      // biome-ignore lint/style/useErrorCause: cause IS forwarded — TreeRejected passes its 3rd-arg ErrorOptions to super(); biome only inspects the 2nd constructor arg (same exemption ZipRejectedError carries).
      throw new TreeRejected(BAD_REQUEST, `conflicting paths in the upload near: ${relTarget}`, {
        cause: err,
      });
    }
    throw err;
  }
}

/** Stage every part under a fresh unique dir, normalizing paths by the sniffed `stagePrefix` + wrapper strip. */
async function stageTree(stagedRoot: string, parts: readonly UploadPart[], wrapper: string | null, stagePrefix: string): Promise<void> {
  for (const part of parts) {
    const relTarget = stagePrefix + stripWrapper(part.relPath, wrapper);
    // biome-ignore lint/performance/noAwaitInLoops: files are staged sequentially to disk (a bounded batch); the whole point is to NOT hold every write in flight at once.
    await stagePart(stagedRoot, relTarget, part.bytes);
  }
}

/** The workload the sniffed layout dispatches to (the token names the staged dir under the staging root). */
function startInput(layout: "st" | "orb", token: string): StartWorkloadInput {
  return layout === "st" ? { kind: "import-st", params: { stagedDir: token } } : { kind: "import-bundle", params: { token, source: "dir" } };
}

/** Sniff + stage the batch into a fresh unique dir. Throws {@link TreeRejected} on an unrecognized layout;
 *  cleans up its OWN partial dir on a staging failure so the caller only owns cleanup after this returns. */
async function stageUpload(
  orbDirs: ReadonlySet<string>,
  stagingRoot: string,
  parts: readonly UploadPart[],
): Promise<{ readonly stagedRoot: string; readonly input: StartWorkloadInput }> {
  const wrapper = commonWrapper(parts.map((p) => p.relPath));
  const layout = sniffTreeLayout(
    parts.map((p) => stripWrapper(p.relPath, wrapper)),
    orbDirs,
  );
  if (layout.kind === "reject") {
    const found = layout.found.join(", ") || "nothing";
    throw new TreeRejected(BAD_REQUEST, `unrecognized library layout (found: ${found})`);
  }
  await mkdir(stagingRoot, { recursive: true });
  const token = `import-tree-${randomUUID()}`;
  const stagedRoot = join(stagingRoot, token);
  await mkdir(stagedRoot, { recursive: true });
  try {
    await stageTree(stagedRoot, parts, wrapper, layout.stagePrefix);
  } catch (err) {
    await rm(stagedRoot, { recursive: true, force: true });
    throw err;
  }
  return { stagedRoot, input: startInput(layout.kind, token) };
}

/** Map a caught upload failure to its typed response; rethrows an unexpected error to the app's onError. */
function errorResponse(c: TreeContext, err: unknown): Response {
  if (err instanceof TreeRejected) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof DomainConflictError) {
    return c.json({ error: "a library import is already running for this account" }, CONFLICT);
  }
  throw err;
}

/** The Hono context slice this route reads (the `c.json` shape `errorResponse` needs). */
interface TreeContext {
  readonly json: (body: { readonly error: string }, status: RejectStatus | typeof CONFLICT) => Response;
}

/** Register `POST /api/import/tree`. Auth-first, CSRF-guarded, DoS-capped; sanitizes + stages the folder
 *  batch, sniffs the layout, and starts the matching per-owner import workload, replying 202 with the id. */
export function registerImportTree(app: Hono<PrincipalEnv>, deps: ImportTreeDeps): void {
  const orbDirs = orbOnlyDirNames(deps.registry);
  app.post(TREE_ROUTE, authCsrfGuard, bodyCap(TREE_MAX_TOTAL_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    try {
      const parts = await collectParts(await c.req.formData());
      const { stagedRoot, input } = await stageUpload(orbDirs, deps.stagingDir ?? tmpdir(), parts);
      try {
        const { id } = await deps.workloads.start({
          input,
          caller: principal,
          mode: "singular",
          ownerId: principal.userId,
        });
        return c.json({ workloadId: id }, ACCEPTED);
      } catch (err) {
        await rm(stagedRoot, { recursive: true, force: true });
        throw err;
      }
    } catch (err) {
      return errorResponse(c, err);
    }
  });
}
