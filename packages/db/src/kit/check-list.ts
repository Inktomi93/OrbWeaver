// check-list — the CHECK-constraint DDL fragment builder. A CHECK is static DDL and cannot carry bound
// parameters, so a column enum's canonical tuple (contracts/db, NOT re-spelled) is rendered into a raw
// SQL literal list once here — every schema file's `check("x_check", sql.raw(\`col in (${checkList(TUPLE)})\`))`
// calls the SAME builder (was 5 local declarations + 11 inline spellings, the users.ts-pattern-by-copy).
// A db-layer primitive (schema/ files build DDL, not helpers) — NOT a schema file itself.

//
// THE VALUES ARE COMPILE-TIME TUPLES, NEVER USER INPUT — so this is a DDL-CORRECTNESS floor, not an
// injection surface, and the escaping below changes NO byte of today's emitted DDL (every live member is
// ASCII with hyphens/underscores; pinned in `tests/db/kit/check-list.test.ts`). What it removes is the
// trap: a future enum member containing an apostrophe rendered as `'it's'`, which terminates the literal
// early and makes the whole CREATE TABLE unparseable — at migration time, in generated DDL nobody reads,
// which is exactly the moment nothing is watching (#1377 item 2).

/** SQLite's string-literal escape, and only it: a single quote is DOUBLED. A backslash is NOT an escape
 *  character in a SQLite literal, so touching one would corrupt a member that legitimately contains it. */
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function checkList(values: readonly string[]): string {
  return values.map(sqlLiteral).join(", ");
}
