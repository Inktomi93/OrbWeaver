// Node errno matching for a caught value, which is `unknown` until a code is read off it.

import process from "node:process";

const MISSING_FILE_CODE = "ENOENT";
const NOT_A_DIRECTORY_CODE = "ENOTDIR";

/** True when `error` is an object whose Node errno `code` is `code`. */
export function hasErrnoCode(error: unknown, code: NodeJS.ErrnoException["code"]): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** The Node errno `code` a caught value carries, or `undefined` when it carries none. */
export function errnoCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

/** True when a file or directory is absent (`ENOENT`). Any other I/O fault is a different failure. */
export function isMissingFile(error: unknown): boolean {
  return hasErrnoCode(error, MISSING_FILE_CODE);
}

/** True when a path names nothing: its last entry is absent (`ENOENT`), or one of its parents is a regular file
 *  (`ENOTDIR`), so nothing can sit beneath it. Any other I/O fault is a different failure. */
export function isAbsentPath(error: unknown): boolean {
  return isMissingFile(error) || hasErrnoCode(error, NOT_A_DIRECTORY_CODE);
}

/** True when a failed directory fsync says the filesystem has no directory fsync, which is a capability and not a
 *  fault. `ENOTSUP` says it on every platform (FUSE, network mounts, some macOS volumes). Windows says it as `EISDIR`
 *  or `EPERM` from the open or the sync; elsewhere those two are a real permission fault. */
export function isDirectorySyncUnsupported(error: unknown): boolean {
  return hasErrnoCode(error, "ENOTSUP") || (process.platform === "win32" && (hasErrnoCode(error, "EISDIR") || hasErrnoCode(error, "EPERM")));
}
