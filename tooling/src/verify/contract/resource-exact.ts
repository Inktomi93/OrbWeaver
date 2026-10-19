// EXACT named files — the door for a policy whose subject is one specific authored file rather than a tree,
// a config grammar, or a parsed data document (the ResourceHost access-pattern ruling §1).
//
// WHY IT IS NOT `authoredText`. The demand door reads only what some OTHER declaration already admitted, so
// a policy whose whole subject is one root config would have to declare a TREE it does not judge in
// order to read one file — and a declaration that admits a corpus a policy never reads is the opposite of
// the fence. These ids name their own paths, are acquirable at planning time, and publish exactly one path
// each. The root configs are also not members of ANY authored tree id, so there is no tree to borrow.
//
// WHY IT IS NOT `json`/`static-config`. Those doors promise a PARSE. These files are TS whose consumers do
// their own text work. The door's promise here is narrower and total: this exact file exists, here is its
// text and its size.
//
// ANY DEMANDED ID THAT DOES NOT RESOLVE REFUSES THE WHOLE FACT. Not a row, not a shorter map. An exact
// resource is named because the policy's judgment is ABOUT it: "the config has no such literal" and
// "the config is gone" are opposite verdicts, and a per-row miss inside a `ready` fact is how the
// second quietly becomes the first.

/** Closed exact-file identities. A gate may not supply a path; adding an id is a contract edit with a
 *  named consumer. */
export const EXACT_RESOURCE_PATHS = {
  /** ROOT runner configs, which no authored tree contains. Neither id has a gate reader left; the exact-file
   *  resource tests are their consumers. */
  "vitest-config": "vitest.config.ts",
  "playwright-ct-config": "playwright-ct.config.ts",
} as const;

export type ExactResourceId = keyof typeof EXACT_RESOURCE_PATHS;

export interface ExactFile {
  readonly id: ExactResourceId;
  readonly path: string;
  readonly text: string;
  readonly bytes: number;
  readonly lines: number;
}
