/** True when a filesystem call failed because the path does not exist. ENOTDIR (a file where a directory
 *  belongs), EACCES and the rest are not absence: a reader that treats them as missing reports a broken
 *  checkout as an empty one. */
export function isMissingEntryError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
