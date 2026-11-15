// Web Storage refuses an access the browser disables (a private mode, a blocked-storage policy, a sandboxed frame) with
// a `SecurityError`, and a write past the quota with a `QuotaExceededError`. A reader or writer that degrades on a
// refused storage narrows to these and rethrows the rest.

const STORAGE_REFUSAL_NAMES: ReadonlySet<string> = new Set(["SecurityError", "QuotaExceededError"]);

/** Whether a Web Storage access threw because the browser refused it. */
export function isStorageRefusal(error: unknown): boolean {
  return Error.isError(error) && STORAGE_REFUSAL_NAMES.has(error.name);
}
