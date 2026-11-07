// The writer's record of a staged upload, and the one reader of staged bytes.
// SECURITY: a local actor may rename, replace or rewrite anything in the staging namespace, and Node has no openat, so
// no open can bind a read to an earlier listing on every platform. The server wrote these bytes, so it records their
// hash as it writes, and a reader accepts bytes only if they hash to that record. A followed link, a swapped parent and
// an in-place rewrite all hash wrong on every filesystem, so no check here depends on a platform or on timing. The
// manifest file sits in the actor's namespace; the digest that vouches for it sits in the workload row.

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { basename, join } from "node:path";
import { STAGED_MANIFEST_FILE } from "@orb/contracts/import";
import { IMPORT_TREE_MAX_FILES } from "@orb/contracts/uploads";
import { isAssetHash } from "@orb/kit/assets";
import { DomainOperationError } from "@orb/kit/errors";
import { z } from "zod";
import { sha256Hex } from "#primitives/content-hash";
import { errnoCode } from "#primitives/errno";

const PATH_SEPARATOR = "/";
const CURRENT_DIR = ".";
const PARENT_DIR = "..";
const BYTES_PER_KIB = 1024;
const ARCHIVE_READ_CHUNK_BYTES = BYTES_PER_KIB * BYTES_PER_KIB;
const LONGEST_STAGED_PATH_BYTES = 4096;
// An entry's size, hash and JSON punctuation.
const MANIFEST_ENTRY_OVERHEAD_BYTES = 128;
// The manifest sits in the actor's namespace and its digest is checked after the read, so the read needs its own cap.
const MANIFEST_MAX_BYTES = IMPORT_TREE_MAX_FILES * (LONGEST_STAGED_PATH_BYTES + MANIFEST_ENTRY_OVERHEAD_BYTES);

/** What an open of a recorded name answers when the tree no longer holds that file there. */
const CHANGED_OPEN_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR", "ELOOP", "EMLINK", "EISDIR", "ENXIO"]);

// Windows defines neither flag, and an undefined flag ORs in as zero. There a followed link hashes wrong, and a device
// fails the regular-file check after the open, so the read needs no branch.
// biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API.
const LEAF_READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK;
// biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API.
const WRITE_ONCE_FLAGS = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;

/** One file the server wrote: `path` is forward-slash relative to the staged root. */
export interface StagedFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export type StagedManifest = readonly StagedFile[];

/** The staged bytes are not the bytes the server wrote. `isInfraFailure` keys on `code`, so the run fails instead of reading a change as a missing file. */
class StagedFileChangedError extends DomainOperationError {
  constructor(path: string, options?: ErrorOptions) {
    super("staged_file_changed", `a staged file changed after the server wrote it: ${path}`);
    this.name = this.constructor.name;
    this.cause = options?.cause;
  }
}

function isRelativeStagedPath(path: string): boolean {
  if (path.includes("\\") || path.includes("\0")) {
    return false;
  }
  return path.split(PATH_SEPARATOR).every((segment) => segment.length > 0 && segment !== CURRENT_DIR && segment !== PARENT_DIR);
}

// A digest can reach a row through the enqueue door, so a manifest that matches it is still checked as input.
const stagedManifestSchema = z.array(
  z.object({ path: z.string().refine(isRelativeStagedPath), size: z.number().int().nonnegative(), sha256: z.string().refine(isAssetHash) }),
);

/** The record of `bytes` as the writer put them at `path`. */
export function stagedFileOf(path: string, bytes: Uint8Array): StagedFile {
  return { path, size: bytes.length, sha256: sha256Hex(bytes) };
}

/** The digest a workload row carries for a staged tree: the hash of its manifest file's bytes. */
function manifestDigest(files: StagedManifest): string {
  return sha256Hex(JSON.stringify(files));
}

/** Write the manifest last, and never over an existing name, returning the digest the row anchors. */
export async function writeStagedManifest(root: string, files: StagedManifest): Promise<string> {
  await using handle = await open(join(root, STAGED_MANIFEST_FILE), WRITE_ONCE_FLAGS);
  await handle.writeFile(JSON.stringify(files));
  return manifestDigest(files);
}

/**
 * Open one leaf without following a link at the final name or blocking on a device.
 * @remarks The caller refuses anything but a regular file: on Windows this open is a plain read.
 */
export async function openLeaf(path: string): Promise<FileHandle> {
  return await open(path, LEAF_READ_FLAGS);
}

async function openRecorded(path: string, label: string): Promise<FileHandle> {
  try {
    return await openLeaf(path);
  } catch (error) {
    if (CHANGED_OPEN_CODES.has(errnoCode(error) ?? "")) {
      throw new StagedFileChangedError(label, { cause: error });
    }
    throw error;
  }
}

async function readAtMost(handle: FileHandle, limit: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(limit);
  let filled = 0;
  while (filled < limit) {
    const { bytesRead } = await handle.read(bytes, filled, limit - filled, filled);
    if (bytesRead === 0) {
      break;
    }
    filled += bytesRead;
  }
  return bytes.subarray(0, filled);
}

function parseManifest(bytes: Uint8Array): StagedManifest {
  // A digest the enqueue door admitted can vouch for bytes that are no manifest, so a parse failure is a refusal too.
  try {
    return stagedManifestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    throw new StagedFileChangedError(STAGED_MANIFEST_FILE, { cause: error });
  }
}

/** Read the manifest at `root`, accepting it only if it hashes to the `digest` the workload row carries. */
export async function readStagedManifest(root: string, digest: string): Promise<StagedManifest> {
  await using handle = await openRecorded(join(root, STAGED_MANIFEST_FILE), STAGED_MANIFEST_FILE);
  const info = await handle.stat();
  if (!info.isFile() || info.size > MANIFEST_MAX_BYTES) {
    throw new StagedFileChangedError(STAGED_MANIFEST_FILE);
  }
  const bytes = await readAtMost(handle, info.size + 1);
  if (sha256Hex(bytes) !== digest) {
    throw new StagedFileChangedError(STAGED_MANIFEST_FILE);
  }
  return parseManifest(bytes);
}

/** Read one recorded file. No byte leaves unless the file is the regular file of that size and hash the server wrote. */
export async function readVerified(root: string, file: StagedFile): Promise<Uint8Array> {
  await using handle = await openRecorded(join(root, ...file.path.split(PATH_SEPARATOR)), file.path);
  const info = await handle.stat();
  if (!info.isFile() || info.size !== file.size) {
    throw new StagedFileChangedError(file.path);
  }
  // One byte past the record, so a file that grew after the stat fails the length check instead of truncating.
  const bytes = await readAtMost(handle, file.size + 1);
  if (bytes.length !== file.size || sha256Hex(bytes) !== file.sha256) {
    throw new StagedFileChangedError(file.path);
  }
  return bytes;
}

/**
 * Open a staged archive and accept it only if it hashes to the digest recorded while it streamed in. The caller owns
 * the handle.
 * @remarks The extractor reads this same handle, so a rename cannot redirect it. A write into this file after the check
 * can still change what extraction reads: the actor then supplies its own bytes, never another file's.
 */
export async function openVerifiedArchive(path: string, sha256: string): Promise<FileHandle> {
  const label = basename(path);
  const handle = await openRecorded(path, label);
  try {
    if (!(await handle.stat()).isFile()) {
      throw new StagedFileChangedError(label);
    }
    const hash = createHash("sha256");
    const chunk = new Uint8Array(ARCHIVE_READ_CHUNK_BYTES);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) {
        break;
      }
      hash.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    if (hash.digest("hex") !== sha256) {
      throw new StagedFileChangedError(label);
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}
