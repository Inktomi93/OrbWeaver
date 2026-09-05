// like — the ONE escape for a user-supplied term interpolated into a SQL `LIKE` pattern.
//
// It lives HERE, beside `batch.ts`, rather than in `@orb/kit`: the escaped string is only meaningful next to
// drizzle's `ESCAPE '\'` clause, so the term and the clause are one piece of SQL vocabulary, not a generic
// string primitive. Three domains had hand-rolled byte-identical copies of it (stats' `escapeLike`,
// automation's `escapeLikePrefix`) before character's library search was found doing NO escaping at all —
// a search for `%` matched the whole library. One home is what keeps the fourth consumer from being wrong.

/** The LIKE metacharacters SQLite recognizes, plus the escape character itself (which must be escaped first
 *  in the same pass — a `replace` over a character class does exactly that, since each input character is
 *  visited once and its replacement is not re-scanned). */
const LIKE_METACHARACTERS = /[\\%_]/g;

/**
 * Escape `%`, `_` and `\` in a user-supplied search term so it matches LITERALLY.
 *
 * ALWAYS paired with an explicit `ESCAPE '\'` clause at the call site — the escape character is not implied
 * by SQLite, so an escaped term under a clause-less `LIKE` matches the backslashes as ordinary text and is
 * WORSE than no escaping at all. The clause is spelled at the call site rather than baked in here because
 * the surrounding pattern differs per caller (`%term%` for contains, `term%` for a prefix).
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(LIKE_METACHARACTERS, (ch) => `\\${ch}`);
}
