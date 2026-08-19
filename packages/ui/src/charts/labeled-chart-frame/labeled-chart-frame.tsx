// The shared labeled-frame both corpus-viz charts (BarList/Histogram) hand-rolled: a heading above
// the `<Chart>` canvas, or an EmptyState when there is no data. `slot` names the data-slot pair
// (`<slot>` on the root, `<slot>-heading` on the heading) so each chart keeps its exact selector
// contract (north-star rule 0.7 — selector stability is API).
//
// It is ALSO where a canvas chart stops being a screen-reader black box: every chart in the family hands
// this frame a `ChartDataTable`, rendered here as ONE visually-hidden `<table>` (side-eye ANALYTICS
// 2026-08-19, P1e — ECharts' native `aria` names the canvas and carries zero data, and axe cannot see into
// a canvas either, which is how the section scored 100/100 while being unreadable). One home, so a new
// chart type gets the equivalent by handing over its data rather than by remembering to.
import type { ReactElement, ReactNode, Ref } from "react";
import { EmptyState } from "#primitives/empty-state";
import type { ChartDataTable } from "../chart/data-table.ts";
import { labeledChartFrameVariants } from "./variants.ts";

interface LabeledChartFrameProps {
  /** The chart's accessible name AND its visible heading (or the EmptyState title when empty). */
  readonly label: string;
  /** The data-slot value for the root; the heading gets `${slot}-heading`. */
  readonly slot: string;
  /** When true, renders the EmptyState in place of the heading + chart. */
  readonly isEmpty: boolean;
  readonly emptyDescription?: string;
  readonly className?: string | undefined;
  /** The chart's series as text — rendered visually-hidden, named with `label`. */
  readonly table?: ChartDataTable | undefined;
  /** The frame ROOT, for a chart that has to measure its own container (width-relative label budgets). */
  readonly ref?: Ref<HTMLDivElement> | undefined;
  /** The `<Chart>` canvas — rendered only when not empty. */
  readonly children: ReactNode;
}

/** The visually-hidden reading of the plot. `scope` makes each header speak for its row/column, and every
 *  cell carries the caller's OWN formatting — the same string the canvas painted, never a re-derived number.
 *
 *  NAMED BY `aria-label`, NOT BY `<caption>`, which is what semantics would otherwise ask for: a caption is
 *  a real TEXT NODE, and it made every existing `getByText(<chart label>)` in the tree resolve to two
 *  elements the moment this table shipped (measured — the bar-list CT's own heading assertion). The
 *  accessible name is identical either way; only the collision differs. */
function ChartDataTableView({ label, slot, table, className }: { label: string; slot: string; table: ChartDataTable; className: string }): ReactElement {
  const [rowColumn, ...valueColumns] = table.columns;
  return (
    <table aria-label={label} className={className} data-slot={`${slot}-data`}>
      <thead>
        <tr>
          <th scope="col">{rowColumn}</th>
          {valueColumns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">{row.header}</th>
            {/* Iterated over the COLUMNS, not the cells: the column name is the cell's identity, and
                driving the row off the header list is also what keeps every row the table's own width. */}
            {valueColumns.map((column, columnIndex) => (
              <td key={column}>{row.cells[columnIndex] ?? ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LabeledChartFrame({
  label,
  slot,
  isEmpty,
  emptyDescription = "No data yet.",
  className,
  table,
  ref,
  children,
}: LabeledChartFrameProps): ReactElement {
  const slots = labeledChartFrameVariants();
  if (isEmpty) {
    return (
      <div className={slots.root({ className })} data-slot={slot} ref={ref}>
        <EmptyState title={label} description={emptyDescription} />
      </div>
    );
  }
  return (
    <div className={slots.root({ className })} data-slot={slot} ref={ref}>
      <p className={slots.heading()} data-slot={`${slot}-heading`}>
        {label}
      </p>
      {children}
      {table === undefined ? null : <ChartDataTableView className={slots.dataTable()} label={label} slot={slot} table={table} />}
    </div>
  );
}
