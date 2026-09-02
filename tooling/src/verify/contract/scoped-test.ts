// The vocabulary of the SCOPED TEST front door (`cli.ts scoped-test <runner> …`, #1192).
//
// The two names are the house TIER names, not the vendor names, because that is what every brief and every
// standing fact already says: "node suites = `pnpm test:scoped`, CT = `pnpm ct:scoped`"
// (.claude/rules/lane-standing-facts.md). Which vendor binary each tier spawns is an implementation fact
// that lives in ops/scoped-test.ts and is free to change; the tier name is the stable surface.
export const SCOPED_TEST_RUNNERS = ["node", "ct"] as const;

export type ScopedTestRunner = (typeof SCOPED_TEST_RUNNERS)[number];

/** What a runner's LIST/collection pass answered: the test files it would actually open, repo-relative
 *  posix — or the reason it could not answer, which is never silently treated as "collected nothing"
 *  (a blind zero here would rebuild the exact defect this door exists to refuse). */
export type ScopedTestCollection = { readonly files: readonly string[] } | { readonly error: string };
