// Cohort comparison: per column, the majority value and every member that differs from it, each with path:line.
// ui-facts compares source cohorts with it, and the ui-audit engine compares rendered cohort members.
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
  /** Values a ruling allows beside the majority: column to value to the cited ruling. They are no outlier. */
  readonly kept?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Members a ruling allows to differ, whatever their value: column to member path to the cited ruling. They are no outlier and no defect. */
  readonly keptSites?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Per column: read straight off the syntax, or inferred from it. A column absent here is unlabelled. */
  readonly basis?: Readonly<Record<string, ColumnBasis>>;
  readonly members: readonly Member[];
}

/** A non-majority value, or one member's value, that a ruling allows, with the members it covers and the ruling's citation. */
export interface KeptValue {
  readonly value: string;
  /** The member's path for a site ruling; null for a value ruling. */
  readonly at: string | null;
  readonly count: number;
  readonly reason: string;
}

type ColumnBasis = "measured" | "heuristic";

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
  /** Non-majority values and members the cohort's `kept` and `keptSites` rulings allow; empty when it names none. */
  readonly kept: readonly KeptValue[];
  readonly informational: boolean;
  readonly basis: ColumnBasis | null;
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
  const rulings = cohort.kept?.[column] ?? {};
  const siteRulings = cohort.keptSites?.[column] ?? {};
  const differs = rows.filter((row) => row.cell.value !== top[0]);
  const bySite = differs.filter((row) => Object.hasOwn(siteRulings, row.member.path));
  const byValue = differs.filter((row) => !bySite.includes(row) && Object.hasOwn(rulings, row.cell.value));
  const keptValues = [...tally(byValue.map((row) => row.cell.value))].map(([value, count]) => ({ value, at: null, count, reason: rulings[value] ?? "" }));
  const keptSites = bySite.map((row) => ({ value: row.cell.value, at: row.member.path, count: 1, reason: siteRulings[row.member.path] ?? "" }));
  return {
    cohort: cohort.name,
    column,
    majority: top[0],
    votes: top[1],
    total: rows.length,
    tied: runnerUp !== undefined && runnerUp[1] === top[1],
    distribution: Object.fromEntries(ranked),
    outliers: informational ? [] : differs.filter((row) => !(bySite.includes(row) || byValue.includes(row))).map(outlierOf),
    defects: rows.filter((row) => cohort.defects?.[column]?.includes(row.cell.value) === true && !Object.hasOwn(siteRulings, row.member.path)).map(outlierOf),
    kept: [...keptValues, ...keptSites],
    informational,
    basis: cohort.basis?.[column] ?? null,
  };
}

export function compareCohort(cohort: Cohort): readonly Comparison[] {
  return [
    ...cohort.columns.flatMap((column) => compareColumn(cohort, column) ?? []),
    ...(cohort.info ?? []).flatMap((column) => compareColumn(cohort, column, true) ?? []),
  ];
}
