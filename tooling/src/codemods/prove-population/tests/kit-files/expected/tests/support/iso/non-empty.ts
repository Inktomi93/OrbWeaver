export function nonEmpty<T>(rows: readonly T[]): T[] {
  expect(rows.every((row) => row !== undefined)).toBe(true);
  return [...rows];
}
