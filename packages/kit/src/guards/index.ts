// Small structural type-guards shared across layers. Narrowing helpers that let callers drop
// `as Record<string, unknown>` casts in favor of a real runtime check.

/**
 * True for a non-null, non-array object. Narrows `unknown` to `Record<string, unknown>` so a value
 * coming off `JSON.parse` / a stored blob can be treated as an object map without a cast.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
