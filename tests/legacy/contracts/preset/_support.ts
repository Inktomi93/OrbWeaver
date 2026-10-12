// Sample values named so the test isn't littered with bare magic numbers (noMagicNumbers).
export const SAMPLE_TEMPERATURE = 0.7;
export const OUT_OF_RANGE_TEMPERATURE = 6; // userIntentSchema caps temperature at 5
export const GUIDED_ACTION_COUNT = 8;
export const SCHEMA_VERSION_V1 = 1;
export const SCHEMA_VERSION_V2 = 2;
export const SCHEMA_VERSION_V3 = 3;
export const SCHEMA_VERSION_V4 = 4;
export const SCHEMA_VERSION_V5 = 5;
export const SCHEMA_VERSION_V6 = 6;
export const SCHEMA_VERSION_V7 = 7;
export const SCHEMA_VERSION_V8 = 8;

/** Code-unit order — the DEFAULT `toSorted()` ordering, spelled explicitly because `useArraySortCompare`
 *  (rightly) refuses a comparator-less sort on an annotated array. Both sides of a set-equality assertion
 *  sort through it, so the ordering only has to be TOTAL and identical, never locale-aware. */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
