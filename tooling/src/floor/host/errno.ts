function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** True when a filesystem call failed because the path does not exist. ENOTDIR (a file where a directory
 *  belongs), EACCES and the rest are not absence: a reader that treats them as missing reports a broken
 *  checkout as an empty one. */
export const isMissingEntryError = (error: unknown): boolean => errnoIs(error, "ENOENT");

/** True when a create call failed because the path is already taken. Any other failure is not contention. */
export const isExistingEntryError = (error: unknown): boolean => errnoIs(error, "EEXIST");
