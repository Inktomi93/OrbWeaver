// The TEXT EQUIVALENT every chart in this family generates — the shape, and the two shared builders.
//
// A canvas chart is a screen-reader black box: ECharts' native `aria` component names the canvas ("Rising,
// image") and stops, and axe/Lighthouse cannot see into a canvas either — which is why the Analytics section
// scored 100/100 while every one of its charts was unreadable (side-eye ANALYTICS 2026-08-19, P1e; the clean
// bill was exactly wrong). `LabeledChartFrame` renders this as a visually-hidden `<table>`.
//
// A TABLE AT EVERY SERIES LENGTH, not a sentence for short ones: an accessible NAME assembled out of data
// stops matching the chart's own visible heading (WCAG 2.5.3 label-in-name — the rule `ListRow.fullTitle`
// exists for) and makes a `getByRole` name data-dependent across every consumer. One home, one shape.

/** One row of a chart's text equivalent: the row header (a category/bucket) plus its formatted cells. */
interface ChartDataRow {
  /** The row's identity, which for a chart IS ITS RANK — a library can hold two characters called
   *  "Tamsin" (the report's own P3), so the header is not an identity and never was. Assigned by the
   *  builders below so the renderer never has to invent one out of an array index. */
  readonly id: string;
  readonly header: string;
  /** Pre-formatted cell values, one per `columns` entry after the first. Never raw numbers — the caller's
   *  own formatter decides what a value READS as, exactly as it does on the canvas. */
  readonly cells: readonly string[];
}

/** A chart's data as a table. `columns[0]` names the ROW-HEADER column; the rest name the data columns. */
export interface ChartDataTable {
  readonly columns: readonly string[];
  readonly rows: readonly ChartDataRow[];
}

/** The two-column shape every ranked/binned chart shares: one labelled category per row, one value. */
export function labelledValueTable(
  categoryColumn: string,
  valueColumn: string,
  rows: readonly { readonly label: string; readonly value: string }[],
): ChartDataTable {
  return {
    columns: [categoryColumn, valueColumn],
    rows: rows.map((row, index) => ({ id: String(index), header: row.label, cells: [row.value] })),
  };
}

/** The matrix shape: one row per `rows` entry, one cell per `cols` entry, values pre-formatted. */
export function matrixTable(
  rowColumn: string,
  cols: readonly string[],
  rows: readonly { readonly label: string; readonly values: readonly string[] }[],
): ChartDataTable {
  return {
    columns: [rowColumn, ...cols],
    rows: rows.map((row, index) => ({ id: String(index), header: row.label, cells: [...row.values] })),
  };
}
