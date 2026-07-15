import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
import { Checkbox } from "#primitives/checkbox";
import { EmptyState } from "#primitives/empty-state";
import type { LucideIcon } from "#primitives/icons";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Icon,
} from "#primitives/icons";
import { tableVariants } from "./variants";

const DEFAULT_PAGE_SIZE = 10;
// A frozen stable default — a fresh new Set() every render would break referential equality for no reason.
const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export interface TableColumn<TData> {
  /** Stable column id — the sort key and the column's React key. */
  readonly id: string;
  readonly header: ReactNode;
  /**
   * Reads this column's value off a row — used for sorting and the default cell renderer. Typed
   * `unknown` deliberately: `cell` also receives the fully-typed `row`, so a custom renderer reads
   * a typed value off `row` directly instead of narrowing `value`.
   */
  readonly accessor: (row: TData) => unknown;
  /** Custom cell renderer. Omit for the default (the raw value, booleans as Yes/No, null as blank). */
  readonly cell?: (value: unknown, row: TData) => ReactNode;
  /** Enables the click-to-sort header button + `aria-sort`. @defaultValue false */
  readonly sortable?: boolean;
  readonly align?: "start" | "center" | "end";
  /** A CSS length (`"8rem"`, `"20%"`) applied to the header cell's `width` — a data-driven layout value. */
  readonly width?: string;
}

export interface TableSort {
  readonly columnId: string;
  readonly direction: "asc" | "desc";
}

export interface TablePagination {
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface TableProps<TData> {
  readonly columns: readonly TableColumn<TData>[];
  readonly data: readonly TData[];
  /**
   * Stable per-row id — must be id-based, never the array index: sorting reorders rows, so an
   * index key would silently reassign a row's React identity, and selection state is keyed by it.
   */
  readonly getRowId: (row: TData, index: number) => string;
  /** Builds a row's accessible name for its selection checkbox (`"Select {label}"`). Falls back to
   * a positional label ("row 3") when omitted. */
  readonly getRowLabel?: (row: TData) => string;
  readonly density?: "default" | "compact";

  /** Controlled sort state. Omit to run uncontrolled off `defaultSorting`. */
  readonly sorting?: TableSort | null;
  readonly defaultSorting?: TableSort | null;
  readonly onSortingChange?: (sort: TableSort | null) => void;

  /** Controlled pagination state. Omit to run uncontrolled off `defaultPagination`. Pagination is
   * always applied client-side over `data`; the footer controls self-suppress when everything
   * fits on one page. To opt out entirely, pass a `pageSize` \>= `data.length`. */
  readonly pagination?: TablePagination;
  readonly defaultPagination?: TablePagination;
  readonly onPaginationChange?: (pagination: TablePagination) => void;

  /** Enables the leading checkbox column + row selection. @defaultValue false */
  readonly selectable?: boolean;
  /** Controlled selection state (a set of `getRowId` values). Omit to run uncontrolled off
   * `defaultSelectedRowIds`. "Select all" selects every row in `data`, not just the current page. */
  readonly selectedRowIds?: ReadonlySet<string>;
  readonly defaultSelectedRowIds?: ReadonlySet<string>;
  readonly onSelectedRowIdsChange?: (ids: ReadonlySet<string>) => void;

  /** Rendered in place of the body when `data` is empty. Defaults to a plain EmptyState. */
  readonly emptyState?: ReactNode;
  readonly className?: string;
  /** Accessible name for the `<table>` element (no built-in visible caption — compose a heading
   * above the table for a visible title). */
  readonly "aria-label"?: string;
}

function comparePrimitive(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    if (a === b) {
      return 0;
    }
    return a ? 1 : -1;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  return null;
}

// Nulls sort last regardless of direction: `sign` applies only to the primitive comparison, never
// to the null branches (which always return +1/-1 to push blanks to the end).
function compareValues(a: unknown, b: unknown, sign: number): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  return sign * (comparePrimitive(a, b) ?? String(a).localeCompare(String(b)));
}

/** A row paired with its stable id + original position — computed once so sorting never needs to
 * re-derive a row's identity via an O(n), possibly-ambiguous `data.indexOf(row)`. */
interface TableEntry<TData> {
  readonly row: TData;
  readonly id: string;
  readonly originalIndex: number;
}

function toEntries<TData>(
  data: readonly TData[],
  getRowId: (row: TData, index: number) => string,
): readonly TableEntry<TData>[] {
  return data.map((row, originalIndex) => ({
    row,
    id: getRowId(row, originalIndex),
    originalIndex,
  }));
}

function sortEntries<TData>(
  entries: readonly TableEntry<TData>[],
  columns: readonly TableColumn<TData>[],
  sort: TableSort | null,
): readonly TableEntry<TData>[] {
  if (sort === null) {
    return entries;
  }
  const column = columns.find((c) => c.id === sort.columnId);
  if (column === undefined) {
    return entries;
  }
  const sign = sort.direction === "desc" ? -1 : 1;
  return [...entries].sort((a, b) =>
    compareValues(column.accessor(a.row), column.accessor(b.row), sign),
  );
}

function defaultCell(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return String(value);
}

function sortIconFor(columnId: string, sort: TableSort | null): LucideIcon {
  if (sort === null || sort.columnId !== columnId) {
    return ChevronsUpDown;
  }
  return sort.direction === "asc" ? ChevronUp : ChevronDown;
}

function ariaSortFor(
  column: Pick<TableColumn<unknown>, "id" | "sortable">,
  sort: TableSort | null,
): "ascending" | "descending" | "none" | undefined {
  if (column.sortable !== true) {
    return;
  }
  if (sort === null || sort.columnId !== column.id) {
    return "none";
  }
  return sort.direction === "asc" ? "ascending" : "descending";
}

/**
 * Table — the general-purpose data-grid: sortable/paginated/selectable columns over `data`, dressed
 * in the token skin. Hand-rolled (no `@tanstack/react-table`): sorting, pagination, and selection
 * are pure derivations over the `data` array plus a controlled-or-uncontrolled state triple.
 * Semantic markup throughout: `<table>`/`<thead>`/`<tbody>`/`<th scope="col">`, `aria-sort` on
 * sortable header cells, and the `Checkbox` primitive for the optional selection column.
 */
export function Table<TData>({
  columns,
  data,
  getRowId,
  getRowLabel,
  density = "default",
  sorting: controlledSorting,
  defaultSorting = null,
  onSortingChange,
  pagination: controlledPagination,
  defaultPagination,
  onPaginationChange,
  selectable = false,
  selectedRowIds: controlledSelectedRowIds,
  defaultSelectedRowIds,
  onSelectedRowIdsChange,
  emptyState,
  className,
  "aria-label": ariaLabel,
}: TableProps<TData>): ReactElement {
  const [uncontrolledSorting, setUncontrolledSorting] = useState<TableSort | null>(defaultSorting);
  const isSortingControlled = controlledSorting !== undefined;
  const sorting = isSortingControlled ? controlledSorting : uncontrolledSorting;

  const [uncontrolledPagination, setUncontrolledPagination] = useState<TablePagination>(
    defaultPagination ?? { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
  );
  const isPaginationControlled = controlledPagination !== undefined;
  const requestedPagination = isPaginationControlled
    ? controlledPagination
    : uncontrolledPagination;

  const [uncontrolledSelectedIds, setUncontrolledSelectedIds] = useState<ReadonlySet<string>>(
    defaultSelectedRowIds ?? EMPTY_SELECTION,
  );
  const isSelectionControlled = controlledSelectedRowIds !== undefined;
  const selectedIds = isSelectionControlled ? controlledSelectedRowIds : uncontrolledSelectedIds;

  const slots = tableVariants({ density });

  function toggleSort(columnId: string): void {
    let next: TableSort | null = { columnId, direction: "asc" };
    if (sorting?.columnId === columnId) {
      next = sorting.direction === "asc" ? { columnId, direction: "desc" } : null;
    }
    if (!isSortingControlled) {
      setUncontrolledSorting(next);
    }
    onSortingChange?.(next);
  }

  function setPagination(next: TablePagination): void {
    if (!isPaginationControlled) {
      setUncontrolledPagination(next);
    }
    onPaginationChange?.(next);
  }

  function setSelected(next: ReadonlySet<string>): void {
    if (!isSelectionControlled) {
      setUncontrolledSelectedIds(next);
    }
    onSelectedRowIdsChange?.(next);
  }

  function toggleRow(id: string): void {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  function toggleAll(ids: readonly string[], isAllSelected: boolean): void {
    setSelected(isAllSelected ? new Set() : new Set(ids));
  }

  const entries = toEntries(data, getRowId);
  const sorted = sortEntries(entries, columns, sorting);

  // If `data` shrinks while the caller sits on a later page, clamp rather than render a blank page.
  const pageSize = requestedPagination.pageSize;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageIndex = Math.min(Math.max(requestedPagination.pageIndex, 0), pageCount - 1);
  const pageStart = pageIndex * pageSize;
  const pageEntries = sorted.slice(pageStart, pageStart + pageSize);

  function goToPage(nextIndex: number): void {
    setPagination({ pageIndex: Math.min(Math.max(nextIndex, 0), pageCount - 1), pageSize });
  }

  const allIds = entries.map((entry) => entry.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some((id) => selectedIds.has(id));

  const columnCount = columns.length + (selectable ? 1 : 0);
  const showPager = pageCount > 1;

  return (
    <div className={cn(slots.root(), className)} data-slot="table-root">
      <div className={slots.scroll()} data-slot="table-scroll">
        <table aria-label={ariaLabel} className={slots.table()} data-slot="table">
          <thead className={slots.thead()}>
            <tr>
              {selectable ? (
                <th
                  className={slots.th({ align: "center" })}
                  data-slot="table-select-header"
                  scope="col"
                >
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={(): void => toggleAll(allIds, allSelected)}
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const align = column.align ?? "start";
                const isSorted = sorting?.columnId === column.id;
                return (
                  <th
                    aria-sort={ariaSortFor(column, sorting)}
                    className={slots.th({ align })}
                    data-slot="table-header-cell"
                    key={column.id}
                    scope="col"
                    style={column.width === undefined ? undefined : { width: column.width }}
                  >
                    {column.sortable === true ? (
                      <button
                        className={slots.sortButton()}
                        data-slot="table-sort-button"
                        onClick={(): void => toggleSort(column.id)}
                        type="button"
                      >
                        <span>{column.header}</span>
                        <Icon
                          className={slots.sortIcon({ sortActive: isSorted })}
                          icon={sortIconFor(column.id, sorting)}
                          size="xs"
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={slots.tbody()}>
            {pageEntries.length === 0 ? (
              <tr>
                <td className={slots.emptyCell()} colSpan={columnCount}>
                  {emptyState ?? <EmptyState title="No data" />}
                </td>
              </tr>
            ) : (
              pageEntries.map(({ row, id, originalIndex }) => {
                const isSelected = selectedIds.has(id);
                return (
                  <tr className={slots.tr()} data-selected={isSelected ? "" : undefined} key={id}>
                    {selectable ? (
                      <td className={slots.td({ align: "center" })} data-slot="table-select-cell">
                        <Checkbox
                          aria-label={`Select ${getRowLabel === undefined ? `row ${originalIndex + 1}` : getRowLabel(row)}`}
                          checked={isSelected}
                          onCheckedChange={(): void => toggleRow(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => {
                      const value = column.accessor(row);
                      return (
                        <td
                          className={slots.td({ align: column.align ?? "start" })}
                          key={column.id}
                        >
                          {column.cell === undefined ? defaultCell(value) : column.cell(value, row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {showPager ? (
        <div className={slots.pager()} data-slot="table-pager">
          <span className={slots.pagerInfo()}>
            {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className={slots.pagerButtons()}>
            <Button
              disabled={pageIndex <= 0}
              intent="ghost"
              onClick={(): void => goToPage(pageIndex - 1)}
              size="sm"
              type="button"
            >
              <Icon icon={ChevronLeft} label="Previous page" size="sm" />
            </Button>
            <span className={slots.pagerInfo()}>
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              disabled={pageIndex >= pageCount - 1}
              intent="ghost"
              onClick={(): void => goToPage(pageIndex + 1)}
              size="sm"
              type="button"
            >
              <Icon icon={ChevronRight} label="Next page" size="sm" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
