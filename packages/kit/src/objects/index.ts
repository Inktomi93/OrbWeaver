/** Drop keys whose value is `undefined`; preserves nulls + falsy non-undefined values. Used by
 *  domain services that accept partial-edit inputs (Zod `.optional()`) and forward only the fields the
 *  caller actually set into a DB UPDATE — otherwise undefined would null-out a column we never meant to
 *  touch. */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  // `Object.keys` is typed `string[]`; the keys of `obj` are exactly `keyof T`, so narrow once here
  // (the sole cast) rather than re-casting each indexed access below.
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
