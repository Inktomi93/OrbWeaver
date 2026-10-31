/** Register one case per row, refusing an empty table at collection time: a table that derives from production and
 *  comes up empty would otherwise register no case and leave its file green. */
export function forEachNonEmpty<T>(rows: readonly T[], name: string, register: (row: T) => void): void {
  if (rows.length === 0) {
    throw new Error(`${name}: the case table is empty, so no case would run`);
  }
  for (const row of rows) {
    register(row);
  }
}
