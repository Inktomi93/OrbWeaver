// EXACT named files — the door for a policy whose subject is one specific authored file rather than a tree,
// a config grammar, or a parsed data document (`resource-gate-access-patterns.md` §1).
//
// WHY IT IS NOT `authoredText`. The demand door reads only what some OTHER declaration already admitted, so
// a policy whose whole subject is `playwright/index.tsx` would have to declare a TREE it does not judge in
// order to read one file — and a declaration that admits a corpus a policy never reads is the opposite of
// the fence. These ids name their own paths, are acquirable at planning time, and publish exactly one path
// each. `playwright/` is also not a member of ANY authored tree id, so for two of them there is no tree to
// borrow.
//
// WHY IT IS NOT `json`/`static-config`. Those doors promise a PARSE. These files are SQL, TSX and CSS whose
// consumers do their own graph/text work (`gates/playwright-css-topology.ts:22-24,49-60`,
// `gates/baseline-single-migration.ts`). The door's promise here is narrower and total: this exact file
// exists, here is its text and its size.
//
// ANY DEMANDED ID THAT DOES NOT RESOLVE REFUSES THE WHOLE FACT. Not a row, not a shorter map. An exact
// resource is named because the policy's judgment is ABOUT it: "the CT boot file has no CSS import" and
// "the CT boot file is gone" are opposite verdicts, and a per-row miss inside a `ready` fact is how the
// second quietly becomes the first.

/** Closed exact-file identities. A gate may not supply a path; adding an id is a contract edit with a
 *  named consumer. */
export const EXACT_RESOURCE_PATHS = {
  /** `dangling-refs`: the literal ignore rules that justify absent-by-design path citations. */
  gitignore: ".gitignore",
  /** `baseline-single-migration`: the squashed baseline the migration journal must agree with. */
  "db-baseline-sql": "packages/db/src/migrations/0000_baseline.sql",
  /** `playwright-css-topology`: the production CSS front door and its two entry modules. */
  "client-entry": "packages/client/src/main.tsx",
  "client-css-entry": "packages/client/src/styles/index.ts",
  "app-shell-surface": "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
  /** `playwright-css-topology`: the CT half, which lives in no authored tree at all. */
  "ct-boot": "playwright/index.tsx",
  "ct-extension-css": "playwright/index.css",
  /** `tooling-runner-config-literals`: the three ROOT runner configs, which no authored tree contains and
   *  which carry the wall clocks and the port literal that cost the most (the vitest lane timeouts, the CT
   *  `mount()` timeout, the CT vite port). The legacy plumbing gate read them off disk past a real-tree
   *  anchor; naming them here makes that read a declared fact. `static-config` cannot serve this consumer:
   *  it publishes SELECTOR rows, and the subject here is a numeric literal. */
  "vitest-config": "vitest.config.ts",
  "playwright-config": "playwright.config.ts",
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
