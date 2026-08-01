/** The KEY-MINIMAL projection: a new object holding exactly `keys`, read off `source`. The key tuple is
 *  the SINGLE spelling — the returned type is `Pick<T, K>` derived from the same tuple — so a projection
 *  and its declared key set cannot drift. Its reason for existing is SET-SEAMS §2.3 (S1/S2): a settings
 *  section's form value and its `owns` claim are both built from one `as const` tuple, which makes
 *  "the patch names only the keys this section owns" true by construction rather than by review. */
export function pickKeys<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  // The accumulator is only Pick-shaped once every key has been copied; the loop below is that proof, so
  // the assertion is the sole cast (the `stripUndefined` posture below).
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = source[key];
  }
  return result;
}

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
