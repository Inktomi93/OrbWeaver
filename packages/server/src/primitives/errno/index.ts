// Node errno matching for a caught value, which is `unknown` until a code is read off it.

const MISSING_FILE_CODE = "ENOENT";

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
