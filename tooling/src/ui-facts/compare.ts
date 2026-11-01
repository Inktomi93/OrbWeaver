// Cohort comparison: per column, the majority value and every member that differs from it, each with path:line.
export interface Cell {
  readonly value: string;
  readonly line: number;
}

export interface Member {
  readonly path: string;
  readonly section: string;
  /** What the member is: a file, or `Tag` for an element. */
  readonly label: string;
  readonly cells: Readonly<Record<string, Cell>>;
}

export interface Cohort {
  readonly name: string;
  readonly what: string;
  /** Columns compared against a majority. */
  readonly columns: readonly string[];
  /** Columns shown as a distribution only: a spread of values, no convention to deviate from. */
  readonly info?: readonly string[];
  /** Values that are a defect whatever the majority: column to the values. */
  readonly defects?: Readonly<Record<string, readonly string[]>>;
  readonly members: readonly Member[];
}

interface Outlier {
  readonly at: string;
  readonly section: string;
  readonly label: string;
  readonly value: string;
}

export interface Comparison {
  readonly cohort: string;
  readonly column: string;
  readonly majority: string;
  readonly votes: number;
  readonly total: number;
  /** Two values hold the top count: the majority is a coin flip, not a convention. */
  readonly tied: boolean;
  readonly distribution: Readonly<Record<string, number>>;
  readonly outliers: readonly Outlier[];
  /** Members holding a value the cohort names a defect, whatever the majority. */
  readonly defects: readonly Outlier[];
  readonly informational: boolean;
}

export const NOT_APPLICABLE = "n/a";

function tally(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function outlierOf(row: { readonly member: Member; readonly cell: Cell }): Outlier {
  return { at: `${row.member.path}:${row.cell.line}`, section: row.member.section, label: row.member.label, value: row.cell.value };
}

function compareColumn(cohort: Cohort, column: string, informational = false): Comparison | null {
  const rows = cohort.members.flatMap((member) => {
    const cell = member.cells[column];
    return cell === undefined || cell.value === NOT_APPLICABLE ? [] : [{ member, cell }];
  });
  if (rows.length === 0) {
    return null;
  }
  const counts = tally(rows.map((row) => row.cell.value));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top, runnerUp] = ranked;
  if (top === undefined) {
    return null;
  }
  return {
    cohort: cohort.name,
    column,
    majority: top[0],
    votes: top[1],
    total: rows.length,
    tied: runnerUp !== undefined && runnerUp[1] === top[1],
    distribution: Object.fromEntries(ranked),
    outliers: informational ? [] : rows.filter((row) => row.cell.value !== top[0]).map(outlierOf),
    defects: rows.filter((row) => cohort.defects?.[column]?.includes(row.cell.value) === true).map(outlierOf),
    informational,
  };
}

export function compareCohort(cohort: Cohort): readonly Comparison[] {
  return [
    ...cohort.columns.flatMap((column) => compareColumn(cohort, column) ?? []),
    ...(cohort.info ?? []).flatMap((column) => compareColumn(cohort, column, true) ?? []),
  ];
}
