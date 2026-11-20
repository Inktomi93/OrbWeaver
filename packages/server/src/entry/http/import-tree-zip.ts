// The SillyTavern profile zip door, POST /api/import/tree/zip, and an INGEST TRUST BOUNDARY: the body is a zip the
// browser read from the person's disk, so every byte of it and every entry name in it is HOSTILE. It runs the same
// import as the folder door: a SillyTavern profile becomes an import-st workload over the same staged tree and
// manifest, so a zip and the folder it was made from preview and import the same.
//
// Belt order: auth (401 before the body is read) → CSRF (403) → a declared length over the tree door's total (413,
// nothing read) → the query fields (400) → one staging upload per owner (409 before the body is read) → the body
// streamed to a staged file under the owner's root, its bytes counted against the tree door's total as they arrive
// (413, partial file removed). No body-limit middleware fronts this route: it would buffer a body with no declared
// length in memory before any of these steps → the file told apart from a zip by its first bytes when it has no
// central directory (400 with a reason) → the central directory read by position under the entry-count and
// per-entry declared-size belts, every name refused fail-closed on traversal (400) → the profile found and its
// entries mapped by name alone: macOS resource forks and Finder files skipped, `secrets.json` dropped, an entry
// outside the profile left in the zip, and only a profile's own top-level planes kept, so the files beside the
// profiles (`cookie-secret.txt`, `_storage/`) stay in the zip → layout admission and the case-twin refusal over the mapped names, before a
// byte is inflated (400) → one entry at a time inflated under its declared size (an entry that inflates past what it
// declares is a bomb, refused by its name) and its CRC-32, the inflated total capped at the tree door's total, each
// written O_EXCL under the staged tree after a resolve-prefix check → the manifest → owner-scoped start (202). A
// refusal at any step removes everything this request staged. An Orbweaver backup zip is not this door's: it answers
// 204 with nothing staged, and the bundle door imports it.
//
// The zip is never held whole: the staged file is read by position, and only one entry's bytes are in memory at once.

import { mkdir, open, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { PersonaCollision, PersonaCollisionChoices, ProfileZipRefusal } from "@orb/contracts/import";
import {
  admitTreeBatch,
  decodePersonaCollisionChoices,
  isStSecretsFile,
  PERSONA_COLLISION_FIELD,
  profileZipStartedSchema,
  ST_SETTINGS_FILE,
  STAGED_MANIFEST_FILE,
  stProfileEntryDisposition,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_FILES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { Context, Hono } from "hono";
import type { UploadedFile } from "#domain/import";
import { DEFAULT_IMPORT_STAGING_DIR, incomingPersonasOf, STAGED_BUNDLE_PREFIX, STAGED_TREE_PREFIX, stagedOwnerRoot } from "#domain/import";
import type { CentralRecord, StagedFile, ZipDirectory, ZipRejectKind } from "#infra/storage";
import { readZipDirectory, stagedFileOf, writeStagedManifest, ZipRejectedError } from "#infra/storage";
import type { PrincipalEnv } from "./contract/request-env.ts";
import { stageCapped } from "./import.ts";
import type { ImportTreeDeps } from "./import-tree.ts";
import {
  authCsrfGuard,
  commonWrapper,
  nativeDirsOf,
  OWNER_ONLY_DIR,
  refuseCaseTwins,
  sanitizeRelPath,
  stagePart,
  stripWrapper,
  TreeRejected,
  volumeFold,
} from "./import-tree.ts";

const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;
const ACCEPTED = 202;
const NO_CONTENT = 204;
const ALREADY_RUNNING = "a library import is already running for this account";

/** A refusal of the upload as a whole, with the reason the client keys its words on. Nothing it staged survives it. */
class ProfileZipRefused extends Error {
  readonly reason: ProfileZipRefusal;
  readonly status: typeof BAD_REQUEST | typeof PAYLOAD_TOO_LARGE;
  constructor(reason: ProfileZipRefusal, message: string, options?: ErrorOptions & { readonly status?: typeof PAYLOAD_TOO_LARGE }) {
    super(message, options);
    this.status = options?.status ?? BAD_REQUEST;
    this.name = "ProfileZipRefused";
    this.reason = reason;
  }
}

/** The reason each zip belt's refusal is told to the client as. */
const ZIP_REFUSAL_OF_KIND: Record<ZipRejectKind, ProfileZipRefusal> = {
  "too-large": "too-large",
  "too-many-entries": "too-large",
  "bad-method": "unsupported",
  unsupported: "unsupported",
  "zip-slip": "unsafe",
  bomb: "unsafe",
  malformed: "damaged",
  "no-directory": "not-zip",
};

// The first bytes that name a file, one character per byte. A zip opens with a local header, or with the end record
// when it is empty.
const SNIFF_BYTES = 512;
const ZIP_HEADS = ["PK\x03\x04", "PK\x05\x06"] as const;
// 7z, rar, gzip (and so .tar.gz), bzip2, xz, zstd.
const OTHER_ARCHIVE_HEADS = ["7z\xBC\xAF\x27\x1C", "Rar!\x1A\x07", "\x1F\x8B", "BZh", "\xFD7zXZ\x00", "\x28\xB5\x2F\xFD"] as const;
// A POSIX tar names itself at this offset.
const TAR_MAGIC_AT = 257;
const TAR_MAGIC = "ustar";
const UTF8_BOM = "﻿";
const HTML_HEAD = /^<(?:!doctype\s+html|html|head|body|!--)/iu;

function opensWith(head: Uint8Array, magic: string, at = 0): boolean {
  return String.fromCharCode(...head.subarray(at, at + magic.length)) === magic;
}

/** What a file with no central directory is, told by its first bytes. */
function sniffNonZip(head: Uint8Array): ProfileZipRefusal {
  if (head.length === 0) {
    return "empty";
  }
  if (ZIP_HEADS.some((magic) => opensWith(head, magic))) {
    return "truncated";
  }
  if (OTHER_ARCHIVE_HEADS.some((magic) => opensWith(head, magic)) || opensWith(head, TAR_MAGIC, TAR_MAGIC_AT)) {
    return "other-archive";
  }
  // A text head that does not decode is only cut mid-character at the sniff's end, so the decode never throws.
  const text = new TextDecoder("utf-8").decode(head).replace(UTF8_BOM, "").trimStart();
  if (text.startsWith("{") || text.startsWith("[")) {
    return "json";
  }
  return HTML_HEAD.test(text) ? "html" : "not-zip";
}

const MACOS_FORK_DIR = "__MACOSX";
const MACOS_FORK_PREFIX = "._";
const FINDER_FILE = ".ds_store";
// The directories only a SillyTavern profile holds at its top, so the shallowest of them marks where a profile starts
// when the zip carries no settings file.
const ST_PROFILE_MARKER_DIRS: ReadonlySet<string> = new Set(["characters", "chats", "User Avatars", "groups", "group chats", "worlds"]);

/** A macOS archiver's resource fork or Finder file: never part of a profile, so it is left in the zip. */
function isPlatformLitter(name: string): boolean {
  const segments = name.split("/");
  const last = segments.at(-1) ?? "";
  return segments.includes(MACOS_FORK_DIR) || last.startsWith(MACOS_FORK_PREFIX) || last.toLowerCase() === FINDER_FILE;
}

/** The directory, ending in `/` or empty at the top, that holds the profile, or the profiles, the zip carries. The
 *  shallowest settings files mark it: one names its profile; several beside each other name the profiles' parent. A
 *  zip with no settings file has its profile where the shallowest profile-only directory sits. */
function profileRoot(names: readonly string[]): string {
  const settings = names.filter((name) => posix.basename(name) === ST_SETTINGS_FILE);
  return settings.length > 0 ? settingsRoot(settings) : markerRoot(names);
}

function asDirPrefix(dir: string): string {
  return dir === "." ? "" : `${dir}/`;
}

function depthOf(name: string): number {
  return name.split("/").length;
}

function settingsRoot(settings: readonly string[]): string {
  const shallowest = Math.min(...settings.map(depthOf));
  const dirs = [...new Set(settings.filter((name) => depthOf(name) === shallowest).map((name) => posix.dirname(name)))];
  const [only] = dirs;
  if (dirs.length === 1 && only !== undefined) {
    return asDirPrefix(only);
  }
  const parents = new Set(dirs.map((dir) => posix.dirname(dir)));
  const [parent] = parents;
  if (parents.size === 1 && parent !== undefined) {
    return asDirPrefix(parent);
  }
  throw new ProfileZipRefused("layout", `this zip holds SillyTavern profiles in more than one place: ${dirs.join(", ")}`);
}

function markerRoot(names: readonly string[]): string {
  let best: readonly string[] | null = null;
  for (const name of names) {
    const segments = name.split("/");
    const at = segments.findIndex((segment, index) => index < segments.length - 1 && ST_PROFILE_MARKER_DIRS.has(segment));
    if (at !== -1 && (best === null || at < best.length)) {
      best = segments.slice(0, at);
    }
  }
  return best === null ? "" : best.map((segment) => `${segment}/`).join("");
}

/** A zip entry the run stages, at its path inside the profile. */
interface ProfileEntry {
  readonly record: CentralRecord;
  readonly relPath: string;
}

/** The entries of the profile, at their paths inside it. A directory record, platform litter, an entry outside the
 *  profile and the credentials file stay in the zip; every name the run keeps passes the tree door's path belt. */
function profileEntries(directory: ZipDirectory): ProfileEntry[] {
  const files = directory.entries.filter((record) => !(record.name.endsWith("/") || isPlatformLitter(record.name)));
  const root = profileRoot(files.map((record) => record.name));
  const kept: ProfileEntry[] = [];
  for (const record of files.filter((candidate) => candidate.name.startsWith(root) && !isStSecretsFile(candidate.name))) {
    const relPath = asRefusal("unsafe", () => sanitizeRelPath(record.name.slice(root.length)));
    if (record.uncompressedSize > IMPORT_TREE_MAX_FILE_BYTES) {
      throw new ProfileZipRefused("too-large", `"${relPath}" is over the ${IMPORT_TREE_MAX_FILE_BYTES} byte per-file cap`, { status: PAYLOAD_TOO_LARGE });
    }
    kept.push({ record, relPath });
  }
  if (kept.length > IMPORT_TREE_MAX_FILES) {
    throw new ProfileZipRefused("too-large", `too many files (over ${IMPORT_TREE_MAX_FILES})`, { status: PAYLOAD_TOO_LARGE });
  }
  return kept;
}

/** The entries a profile import reads: those under a profile's own top-level planes, as the collector and the folder
 *  planner keep them. Anything else beside the profiles, such as SillyTavern's `cookie-secret.txt` or its `_storage/`
 *  account records at the root of a `data/` folder, stays in the zip. */
function profileContent(entries: readonly ProfileEntry[], stagePrefix: string): ProfileEntry[] {
  return entries.filter((entry) => {
    const [, top, ...rest] = (stagePrefix + entry.relPath).split("/");
    return top !== undefined && stProfileEntryDisposition(top, rest.length > 0).handled;
  });
}

/** Run a tree door belt, and tell its refusal as `reason`. */
function asRefusal<T>(reason: ProfileZipRefusal, belt: () => T): T {
  try {
    return belt();
  } catch (err) {
    throw refusalOf(reason, err);
  }
}

/** A tree door belt's refusal told as `reason`; any other error as it is. */
function refusalOf(reason: ProfileZipRefusal, err: unknown): unknown {
  return err instanceof TreeRejected ? new ProfileZipRefused(reason, err.message, { cause: err }) : err;
}

// The persona review reads the settings file and the avatars beside it.
const AVATARS_SEGMENT = "/User Avatars/";

/** Inflate and stage the profile one entry at a time, then its manifest. Returns the manifest digest and, for the
 *  persona review, the settings files and avatars it staged. */
async function stageProfile(
  stagedRoot: string,
  directory: ZipDirectory,
  entries: readonly ProfileEntry[],
  stagePrefix: string,
): Promise<{ readonly stagedDigest: string; readonly reviewParts: UploadedFile[] }> {
  const files: StagedFile[] = [];
  const reviewParts: UploadedFile[] = [];
  let inflated = 0;
  for (const { record, relPath } of entries) {
    const relTarget = stagePrefix + relPath;
    if (volumeFold(relTarget) === volumeFold(STAGED_MANIFEST_FILE)) {
      throw new ProfileZipRefused("unsafe", `reserved file name: ${relTarget}`);
    }
    const bytes = await directory.inflate(record);
    inflated += bytes.length;
    if (inflated > IMPORT_TREE_MAX_TOTAL_BYTES) {
      throw new ProfileZipRefused("too-large", `this zip unpacks to more than ${IMPORT_TREE_MAX_TOTAL_BYTES} bytes`, { status: PAYLOAD_TOO_LARGE });
    }
    try {
      await stagePart(stagedRoot, relTarget, bytes);
    } catch (err) {
      throw refusalOf("unsafe", err);
    }
    files.push(stagedFileOf(relTarget, bytes));
    if (posix.basename(relTarget) === ST_SETTINGS_FILE || relTarget.includes(AVATARS_SEGMENT)) {
      reviewParts.push({ relPath: relTarget, bytes });
    }
  }
  return { stagedDigest: await writeStagedManifest(stagedRoot, files), reviewParts };
}

interface ZipFields {
  readonly choices: PersonaCollisionChoices;
  readonly dryRun: boolean;
}

/** The query's persona answers and dry-run flag. A malformed one refuses the upload before its body is read: a
 *  preview must never fall through to a real import, and an answer that cannot be read never falls back to a default. */
function readFields(c: Context<PrincipalEnv>): ZipFields | string {
  const choices = decodePersonaCollisionChoices(c.req.queries(PERSONA_COLLISION_FIELD) ?? []);
  if (choices === null) {
    return `malformed "${PERSONA_COLLISION_FIELD}" field`;
  }
  const dryRun = c.req.queries(TREE_DRY_RUN_FIELD) ?? [];
  if (dryRun.length > 1 || (dryRun.length === 1 && dryRun[0] !== TREE_DRY_RUN_VALUE)) {
    return `malformed "${TREE_DRY_RUN_FIELD}" field`;
  }
  return { choices, dryRun: dryRun.length === 1 };
}

/** The staged zip's central directory, or the refusal that says what the file is when it has none. */
async function openDirectory(zipPath: string): Promise<{ readonly directory: ZipDirectory; readonly close: () => Promise<void> }> {
  const handle = await open(zipPath, "r");
  try {
    return {
      directory: await readZipDirectory(handle, { maxTotalBytes: IMPORT_TREE_MAX_TOTAL_BYTES, maxEntryBytes: IMPORT_TREE_MAX_TOTAL_BYTES }),
      close: () => handle.close(),
    };
  } catch (err) {
    if (!(err instanceof ZipRejectedError)) {
      await handle.close();
      throw err;
    }
    let reason = ZIP_REFUSAL_OF_KIND[err.kind];
    if (err.kind === "no-directory") {
      const head = new Uint8Array(SNIFF_BYTES);
      const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
      reason = sniffNonZip(head.subarray(0, bytesRead));
    }
    await handle.close();
    // biome-ignore lint/style/useErrorCause: cause IS forwarded — ProfileZipRefused passes its 3rd-arg options to super(); biome only inspects the 2nd constructor arg (same exemption ZipRejectedError carries).
    throw new ProfileZipRefused(reason, err.message, { cause: err, ...(reason === "too-large" ? { status: PAYLOAD_TOO_LARGE } : {}) });
  }
}

type ZipOutcome =
  | { readonly kind: "backup" }
  | { readonly kind: "staged"; readonly token: string; readonly stagedDigest: string; readonly reviewParts: UploadedFile[] };

/** Whether the zip is an Orbweaver backup, read as the tree door reads a picked folder: under its one wrapper. */
function isBackup(directory: ZipDirectory, nativeDirs: ReadonlySet<string>): boolean {
  const names = directory.entries.filter((record) => !(record.name.endsWith("/") || isPlatformLitter(record.name))).map((record) => record.name);
  const wrapper = commonWrapper(names);
  return (
    admitTreeBatch(
      names.map((name) => stripWrapper(name, wrapper)),
      null,
      nativeDirs,
    ).kind === "orb"
  );
}

/** Read the staged zip and stage its profile under a fresh tree. An Orbweaver backup stages nothing. */
async function stageFromZip(zipPath: string, ownerRoot: string, deps: ImportTreeDeps, nativeDirs: ReadonlySet<string>): Promise<ZipOutcome> {
  const { directory, close } = await openDirectory(zipPath);
  try {
    if (isBackup(directory, nativeDirs)) {
      return { kind: "backup" };
    }
    const entries = profileEntries(directory);
    const layout = admitTreeBatch(
      entries.map((entry) => entry.relPath),
      null,
      nativeDirs,
    );
    if (layout.kind !== "st") {
      const found = layout.kind === "reject" ? layout.found.join(", ") : "Orbweaver backup folders";
      throw new ProfileZipRefused("layout", `this zip holds no SillyTavern profile (found: ${found || "nothing"})`);
    }
    const kept = profileContent(entries, layout.stagePrefix);
    asRefusal("case-twins", () => refuseCaseTwins(kept.map((entry) => entry.relPath)));
    const token = `${STAGED_TREE_PREFIX}${deps.newOpaqueId()}`;
    const stagedRoot = join(ownerRoot, token);
    await mkdir(stagedRoot, { recursive: true });
    try {
      return { kind: "staged", token, ...(await stageProfile(stagedRoot, directory, kept, layout.stagePrefix)) };
    } catch (err) {
      await rm(stagedRoot, { recursive: true, force: true });
      throw err;
    }
  } finally {
    await close();
  }
}

/** One upload to the door: its request, body, signed-in caller and query fields. */
interface ZipRequest {
  readonly c: Context<PrincipalEnv>;
  readonly body: ReadableStream<Uint8Array>;
  readonly principal: Principal;
  readonly fields: ZipFields;
}

/** Stage the body, stage its profile, and start the import; the staged zip itself never outlives the request. */
async function importZip({ c, body, principal, fields }: ZipRequest, deps: ImportTreeDeps, nativeDirs: ReadonlySet<string>): Promise<Response> {
  const ownerRoot = stagedOwnerRoot(deps.stagingDir ?? DEFAULT_IMPORT_STAGING_DIR, principal.userId);
  await mkdir(ownerRoot, { recursive: true, mode: OWNER_ONLY_DIR });
  const zipPath = join(ownerRoot, `${STAGED_BUNDLE_PREFIX}${deps.newOpaqueId()}.zip`);
  try {
    if ((await stageCapped(body, zipPath, IMPORT_TREE_MAX_TOTAL_BYTES)) === null) {
      return c.json({ error: "this zip is over the maximum upload size", reason: "too-large" satisfies ProfileZipRefusal }, PAYLOAD_TOO_LARGE);
    }
    const outcome = await stageFromZip(zipPath, ownerRoot, deps, nativeDirs);
    if (outcome.kind === "backup") {
      return c.body(null, NO_CONTENT);
    }
    // The stage is this request's until a job owns it, so a failed review or start removes it.
    try {
      const collisions: readonly PersonaCollision[] = fields.dryRun
        ? await deps.persona.reviewImport({ principal, incoming: incomingPersonasOf(outcome.reviewParts) })
        : [];
      const { id } = await deps.workloads.start({
        input: {
          kind: "import-st",
          params: {
            stagedDir: outcome.token,
            stagedDigest: outcome.stagedDigest,
            personaCollisions: fields.choices,
            ...(fields.dryRun ? { dryRun: true } : {}),
          },
        },
        caller: principal,
        mode: "singular",
        ownerId: principal.userId,
      });
      return c.json(profileZipStartedSchema.parse({ workloadId: id, collisions }), ACCEPTED);
    } catch (err) {
      await rm(join(ownerRoot, outcome.token), { recursive: true, force: true });
      throw err;
    }
  } finally {
    await rm(zipPath, { force: true });
  }
}

/** Register `POST /api/import/tree/zip`: a SillyTavern profile zip in the request body, imported or dry-run as the
 *  folder door would import the folder it was made from. */
export function registerImportTreeZip(app: Hono<PrincipalEnv>, deps: ImportTreeDeps): void {
  const nativeDirs = nativeDirsOf(deps.registry);
  // Owners whose zip is still staging: the import slot answers only at `start`, after the whole zip is on disk.
  const staging = new Set<UserId>();
  app.post(PORTABILITY_ROUTES.importTreeZip, authCsrfGuard, async (c) => {
    // The guard above answered a signed-out caller already.
    const principal = c.get("principal");
    const body = c.req.raw.body;
    if (principal === null || body === null) {
      return c.json({ error: "this upload is empty", reason: "empty" satisfies ProfileZipRefusal }, BAD_REQUEST);
    }
    // Hono's body limit would buffer a body with no declared length before this handler runs, so the cap is applied
    // here: a declared length over it is refused unread, and `stageCapped` counts the bytes as they stream to disk.
    if (Number(c.req.header("content-length")) > IMPORT_TREE_MAX_TOTAL_BYTES) {
      await body.cancel();
      return c.json({ error: "this zip is over the maximum upload size", reason: "too-large" satisfies ProfileZipRefusal }, PAYLOAD_TOO_LARGE);
    }
    const fields = readFields(c);
    if (typeof fields === "string" || staging.has(principal.userId)) {
      await body.cancel();
      return typeof fields === "string" ? c.json({ error: fields }, BAD_REQUEST) : c.json({ error: ALREADY_RUNNING }, CONFLICT);
    }
    staging.add(principal.userId);
    // owned by refusalResponse: it answers a refusal and a held import slot as typed responses and rethrows every
    // other error to the app's onError.
    try {
      return await importZip({ c, body, principal, fields }, deps, nativeDirs);
    } catch (err) {
      return refusalResponse(c, err);
    } finally {
      staging.delete(principal.userId);
    }
  });
}

/** A caught failure as its typed response; any other error is rethrown to the app's onError. */
function refusalResponse(c: Context<PrincipalEnv>, err: unknown): Response {
  if (err instanceof ProfileZipRefused) {
    return c.json({ error: err.message, reason: err.reason }, err.status);
  }
  // An entry the directory admitted can still fail as it inflates: a bomb, a bad CRC, a broken stream.
  if (err instanceof ZipRejectedError) {
    return c.json({ error: err.message, reason: ZIP_REFUSAL_OF_KIND[err.kind] }, BAD_REQUEST);
  }
  if (err instanceof DomainConflictError) {
    return c.json({ error: ALREADY_RUNNING }, CONFLICT);
  }
  throw err;
}
