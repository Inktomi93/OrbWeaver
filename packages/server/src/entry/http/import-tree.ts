// The folder-upload ingest registrar — the Backup & Restore pane's directory-import seam and an INGEST TRUST
// BOUNDARY: the browser posts a multipart batch where each part's filename is its `webkitRelativePath`
// (browser-supplied, HOSTILE). POST /api/import/tree sanitizes every relative path FAIL-CLOSED, stages the
// batch into a fresh unique dir under the staging root, sniffs the tree layout, and enqueues the matching
// per-owner import workload (import-st for a SillyTavern profile tree, import-bundle for an orb backup tree),
// replying 202 {workloadId}. The workload owns the staged tree's cleanup (its runner-env op removes it in a
// finally), mirroring the staged-zip path — including its PER-UPLOADER staging root (#1534): the tree stages
// under `<root>/<uploader userId>/`, the namespace the import contribution re-derives from its row's owner,
// so the handle in `params.stagedDir`/`params.token` names bytes for exactly one account and authorizes
// nothing on its own. One home for the derivation + the app-owned default root:
// `domain/import/substrate/staging.ts`.
//
// Belt order mirrors the sibling upload routes: auth (401 before the body is read) → CSRF (403 on a cookie
// mutation missing the custom header) → a hono/body-limit total-bytes cap (413) → per-file + count caps
// (413) → fail-closed path sanitization (400, WHOLE upload rejected, nothing staged) → resolve-escape check
// (never trust string filtering alone) → layout admission (400 on an unrecognized/ambiguous tree, or on a
// declared native batch that is not wholly native — the declaration routes, it never authorizes) → owner-scoped
// start. Every rejection is typed; a rejected path or a cap breach fails the WHOLE upload (no partial staging).

import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { PersonaCollisionChoices, TreeLayoutDeclaration } from "@orb/contracts/import";
import {
  admitTreeBatch,
  decodePersonaCollisionChoices,
  importStartedSchema,
  isStSecretsFile,
  PERSONA_COLLISION_FIELD,
  TREE_FILE_FIELD,
  TREE_LAYOUT_FIELD,
  treeLayoutDeclarationSchema,
} from "@orb/contracts/import";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import { IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_FILES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { DomainConflictError } from "@orb/kit/errors";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DEFAULT_IMPORT_STAGING_DIR, incomingPersonasOf, stagedOwnerRoot } from "#domain/import";
import type { PersonaService } from "#domain/persona";
import type { WorkloadService } from "#domain/workloads";
import { getLog } from "#foundation/observability";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./blob.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;
const ACCEPTED = 202;
const TREE_ROUTE = "/api/import/tree";
const REVIEW_ROUTE = "/api/import/tree/review";
/** Staging dirs are per-uploader, so they are created rwx for the app user only. */
const OWNER_ONLY_DIR = 0o700;

// Total batch cap — the ceiling on the whole multipart body (formData buffers it in memory). Raised to
// 1 GiB (owner, 2026-08-08) for whole-ST-profile folder imports: a real SillyTavern default-user tree
// runs 500 MiB–1 GiB (character-card PNGs + chat logs dominate), and the 256 MiB memory-DoS ceiling is a
// MULTI-USER concern — on a single-owner self-hosted box the owner's own upload is not a threat. NOTE the
// .zip/bundle route is NOT an escape hatch here: it caps at 256 MiB COMPRESSED and only accepts an ORB
// backup layout (no ST sniff), so the multipart tree route is the sole whole-ST-folder ingest.
// Per-file cap — the same per-blob bound the asset store + the zip per-entry belt enforce (64 MiB).
// File-count ceiling — the zip extractor's per-archive entry cap (50k); the collect.ts MAX_DIR_ENTRIES (100k)
// is the loop-guard shape, this is the route-level DoS bound on a single upload.

const DRIVE_LETTER = /^[a-zA-Z]:/;
const TRAILING_SLASH = /\/$/;
// @orb-waive no-inline-package-interface(ImportTreeDeps): baselined when the gate landed; burn-down item 952.
export interface ImportTreeDeps {
  readonly workloads: Pick<WorkloadService, "start">;
  readonly persona: Pick<PersonaService, "reviewImport">;
  /** The portability registry — its entity-dir names are the native directory set layout admission reads. */
  readonly registry: PortabilityRegistry;
  readonly stagingDir?: string;
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
 *  before a single body byte is read (identical to the sibling upload routes' guard). CSRF keys on the
 *  ambient-credential arms `via !== "header"` (cookie + the loopback owner fallback) because this is a
 *  CORS-"simple" multipart route with no preflight — see the WHY-block in upload.ts's authCsrfGuard (#300). */
const authCsrfGuard: MiddlewareHandler<PrincipalEnv> = async (c, next) => {
  const principal = c.get("principal");
  if (principal === null) {
    return c.body(null, UNAUTHORIZED);
  }
  if (principal.via !== "header" && !hasCsrfHeader(c.req.raw.headers)) {
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

/** Collect + validate the multipart parts fail-closed: count, per-file bytes, path sanitization. Throws
 *  {@link TreeRejected} (nothing staged) on the first breach. A `secrets.json` part is dropped, never staged. */
async function collectParts(form: FormData): Promise<UploadPart[]> {
  const received = form.getAll(TREE_FILE_FIELD).filter((e): e is File => e instanceof File);
  // The browser never sends the credentials file; this guard holds for a caller that is not our browser.
  const files = received.filter((f) => !isStSecretsFile(f.name));
  // DIAGNOSTIC: how many parts the server actually received + their total bytes. Locates a truncated
  // whole-folder upload (client/browser vs server body cap) — a real ST library is hundreds of cards.
  getLog().info(
    { receivedFiles: received.length, droppedSecrets: received.length - files.length, totalBytes: files.reduce((n, f) => n + f.size, 0) },
    "import-tree: multipart parts received",
  );
  if (files.length === 0) {
    throw new TreeRejected(BAD_REQUEST, `no "${TREE_FILE_FIELD}" uploads`);
  }
  if (files.length > IMPORT_TREE_MAX_FILES) {
    throw new TreeRejected(PAYLOAD_TOO_LARGE, `too many files (over ${IMPORT_TREE_MAX_FILES})`);
  }
  const parts: UploadPart[] = [];
  for (const file of files) {
    if (file.size > IMPORT_TREE_MAX_FILE_BYTES) {
      throw new TreeRejected(PAYLOAD_TOO_LARGE, `"${file.name}" exceeds the ${IMPORT_TREE_MAX_FILE_BYTES} byte per-file cap`);
    }
    const relPath = sanitizeRelPath(file.name);
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
    await stagePart(stagedRoot, relTarget, part.bytes);
  }
}

/** The workload the sniffed layout dispatches to (the token names the staged dir under the staging root). */
function startInput(layout: "st" | "orb", token: string, choices: PersonaCollisionChoices): StartWorkloadInput {
  return layout === "st"
    ? { kind: "import-st", params: { stagedDir: token, personaCollisions: choices } }
    : { kind: "import-bundle", params: { token, source: "dir" } };
}

/** The review's per-collision choices off the commit form. Malformed ones reject the whole upload: a choice
 *  that cannot be read must not fall back to a silent default. */
function readCollisionChoices(form: FormData): PersonaCollisionChoices {
  const values = form.getAll(PERSONA_COLLISION_FIELD).filter((v): v is string => typeof v === "string");
  const choices = decodePersonaCollisionChoices(values);
  if (choices === null) {
    throw new TreeRejected(BAD_REQUEST, `malformed "${PERSONA_COLLISION_FIELD}" field`);
  }
  return choices;
}

/** The batch's declared layout. A malformed or repeated declaration rejects the whole upload instead of
 *  falling back to sniffing the batch alone. */
function readLayoutDeclaration(form: FormData): TreeLayoutDeclaration | null {
  const values = form.getAll(TREE_LAYOUT_FIELD);
  if (values.length === 0) {
    return null;
  }
  const parsed = values.length === 1 ? treeLayoutDeclarationSchema.safeParse(values[0]) : null;
  if (parsed?.success !== true) {
    throw new TreeRejected(BAD_REQUEST, `malformed "${TREE_LAYOUT_FIELD}" field`);
  }
  return parsed.data;
}

/** Admit + stage the batch into a fresh unique dir. Throws {@link TreeRejected} on an unrecognized layout;
 *  cleans up its OWN partial dir on a staging failure so the caller only owns cleanup after this returns. */
async function stageUpload(
  nativeDirs: ReadonlySet<string>,
  stagingRoot: string,
  parts: readonly UploadPart[],
  fields: { readonly choices: PersonaCollisionChoices; readonly declared: TreeLayoutDeclaration | null },
): Promise<{ readonly stagedRoot: string; readonly input: StartWorkloadInput }> {
  const wrapper = commonWrapper(parts.map((p) => p.relPath));
  const layout = admitTreeBatch(
    parts.map((p) => stripWrapper(p.relPath, wrapper)),
    fields.declared,
    nativeDirs,
  );
  if (layout.kind === "reject") {
    const found = layout.found.join(", ") || "nothing";
    throw new TreeRejected(BAD_REQUEST, `unrecognized library layout (found: ${found})`);
  }
  await mkdir(stagingRoot, { recursive: true, mode: OWNER_ONLY_DIR });
  const token = `import-tree-${randomUUID()}`;
  const stagedRoot = join(stagingRoot, token);
  await mkdir(stagedRoot, { recursive: true });
  try {
    await stageTree(stagedRoot, parts, wrapper, layout.stagePrefix);
  } catch (err) {
    await rm(stagedRoot, { recursive: true, force: true });
    throw err;
  }
  return { stagedRoot, input: startInput(layout.kind, token, fields.choices) };
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
  const nativeDirs = new Set(deps.registry.map((entity) => entity.dir.replace(TRAILING_SLASH, "")));
  app.post(TREE_ROUTE, authCsrfGuard, bodyCap(IMPORT_TREE_MAX_TOTAL_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // @orb-waive caught-failure-ownership(err): propagated — the HTTP entry boundary's own error
    // mapper (`errorResponse`) answers the caller with the failure as a response; the inner catch (staging
    // cleanup) rethrows unconditionally. Never a silent swallow. Ends if this route stops being the terminal
    // HTTP handler.
    try {
      const form = await c.req.formData();
      const parts = await collectParts(form);
      const { stagedRoot, input } = await stageUpload(nativeDirs, stagedOwnerRoot(deps.stagingDir ?? DEFAULT_IMPORT_STAGING_DIR, principal.userId), parts, {
        choices: readCollisionChoices(form),
        declared: readLayoutDeclaration(form),
      });
      try {
        const { id } = await deps.workloads.start({
          input,
          caller: principal,
          mode: "singular",
          ownerId: principal.userId,
        });
        return c.json(importStartedSchema.parse({ workloadId: id }), ACCEPTED);
      } catch (err) {
        await rm(stagedRoot, { recursive: true, force: true });
        throw err;
      }
    } catch (err) {
      return errorResponse(c, err);
    }
  });
  registerPersonaReview(app, deps);
}

/** Register `POST /api/import/tree/review`. Read-only: the same belts, but nothing is staged and no workload
 *  starts. The browser sends only the `settings.json` + `User Avatars/` parts; the answer lists the personas
 *  the real run would split. */
function registerPersonaReview(app: Hono<PrincipalEnv>, deps: ImportTreeDeps): void {
  app.post(REVIEW_ROUTE, authCsrfGuard, bodyCap(IMPORT_TREE_MAX_TOTAL_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // @orb-waive caught-failure-ownership(err): propagated — `errorResponse` answers the caller with the
    // failure as a response; nothing is swallowed. Ends if this route stops being the terminal HTTP handler.
    try {
      const parts = await collectParts(await c.req.formData());
      const incoming = incomingPersonasOf(parts);
      const collisions = await deps.persona.reviewImport({ principal, incoming });
      return c.json({ collisions });
    } catch (err) {
      return errorResponse(c, err);
    }
  });
}
