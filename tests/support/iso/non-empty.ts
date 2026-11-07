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

function holdsOne<T>(rows: readonly T[]): rows is readonly [T, ...T[]] {
  return rows.length > 0;
}

/** The rows, proven to hold at least one: a check over every row is true of an empty list, so it proves nothing there. */
export function nonEmpty<T>(rows: readonly T[]): [T, ...T[]] {
  if (!holdsOne(rows)) {
    throw new Error("expected at least one row, got none: a check over every row would pass on nothing");
  }
  return [...rows];
}

/** The value, proven present: a negative check on a missing row's field compares `undefined` and passes. */
export function present<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(`expected a value, got ${String(value)}: a check on its fields would pass on nothing`);
  }
  return value;
}
