// check-list — the CHECK-constraint DDL fragment builder. A CHECK is static DDL and cannot carry bound
// parameters, so a column enum's canonical tuple (contracts/db, NOT re-spelled) is rendered into a raw
// SQL literal list once here — every schema file's `check("x_check", sql.raw(\`col in (${checkList(TUPLE)})\`))`
// calls the SAME builder (was 5 local declarations + 11 inline spellings, the users.ts-pattern-by-copy).
// A db-layer primitive (schema/ files build DDL, not helpers) — NOT a schema file itself.

export function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}
