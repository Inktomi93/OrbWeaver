// db/schema/_shared — the ONE `checkList()` home. A CHECK list is a static DDL fragment derived from a
// canonical tuple (NOT re-spelled): e.g. `role in ('system', 'user', 'assistant')`. A CHECK cannot carry
// bound parameters (the users.ts pattern every schema file cited by convention-by-copy before this hoist).

export function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}
