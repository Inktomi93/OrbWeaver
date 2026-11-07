// Argv as a file may hold it. The brand is the boundary: a run index and a session row take these types, and only
// `lib/disk-safe-argv.ts` mints them, so raw process arguments cannot reach either writer by accident.

declare const diskSafe: unique symbol;

/** Process arguments with every private value masked. */
export type DiskSafeArgv = readonly string[] & { readonly [diskSafe]: "argv" };

/** A session op: one line naming a request, built from masked arguments. */
export type DiskSafeOp = string & { readonly [diskSafe]: "op" };
