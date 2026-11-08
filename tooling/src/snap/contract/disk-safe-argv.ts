// What a file may hold. The brands are the boundary: writers take these types, and only `lib/disk-safe-argv.ts` and
// `lib/private-values.ts` mint them, so raw arguments and page text cannot reach a writer by accident.

declare const diskSafe: unique symbol;

/** What every masked value reads as, in arguments and in evidence alike. */
export const PRIVATE_MASK = "<private>";

/** Process arguments with every private value masked. */
export type DiskSafeArgv = readonly string[] & { readonly [diskSafe]: "argv" };

/** A session op: one line naming a request, built from masked arguments. */
export type DiskSafeOp = string & { readonly [diskSafe]: "op" };

/** A URL with its userinfo and every sensitive query value masked. */
export type DiskSafeUrl = string & { readonly [diskSafe]: "url" };

/** Text read back from a page or the browser, with every revealed private value replaced. */
export type DiskSafeText = string & { readonly [diskSafe]: "text" };

/**
 * A value an operator handed snap in private. It is not a string, so no writer, template or label accepts it, and it
 * serializes as the mask, so a whole `Args` is safe to print.
 */
export interface PrivateText {
  /** The value, for the page and nothing else. Reading it notes it, so evidence the page echoes can be scrubbed. */
  readonly reveal: () => string;
  /** Compare without revealing, so a check that never reaches the page notes nothing. */
  readonly equals: (other: PrivateText) => boolean;
  readonly toJSON: () => string;
}
