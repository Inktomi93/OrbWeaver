// Markdown table and grouping helpers every report section shares.

/** A pipe table with a trailing blank line; a pipe inside a cell is escaped. */
export const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [
  `| ${head.join(" | ")} |`,
  `| ${head.map(() => "-").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`),
  "",
];

export function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  }
  return map;
}
