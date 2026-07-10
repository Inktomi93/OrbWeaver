// Story wrappers for the table CT (CT mounts from a non-test module). BasicTableStory covers
// render/sort/selection/density; PaginatedTableStory covers the pager; ShrinkingDataStory
// reproduces the R7 "parent re-renders with a freshly-derived array" shape (the autocomplete
// DerivedItemsStory precedent) against the page-clamp footgun (ui-primitive-contract §13 R7).
import type { TableColumn } from "@orb/ui/table";
import { Table } from "@orb/ui/table";
import type { ReactElement } from "react";
import { useState } from "react";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number;
}

// Deliberately NOT alphabetical/numeric insertion order — sorting must visibly reorder rows.
const PEOPLE: readonly Person[] = [
  { id: "u1", name: "Elara", age: 34 },
  { id: "u2", name: "Bram", age: 19 },
  { id: "u3", name: "Cass", age: 47 },
  { id: "u4", name: "Dex", age: 25 },
];

const COLUMNS: readonly TableColumn<Person>[] = [
  { id: "name", header: "Name", accessor: (p) => p.name, sortable: true },
  { id: "age", header: "Age", accessor: (p) => p.age, align: "end", sortable: true },
  // Deliberately non-sortable — pins the "no aria-sort attribute at all" half of the contract
  // (vs. `aria-sort="none"` for a sortable-but-unsorted column).
  { id: "status", header: "Status", accessor: () => "Active" },
];

export function BasicTableStory({
  density = "default",
  selectable = false,
}: {
  density?: "default" | "compact";
  selectable?: boolean;
}): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <Table
      aria-label="People"
      columns={COLUMNS}
      data={PEOPLE}
      density={density}
      getRowId={(p): string => p.id}
      getRowLabel={(p): string => p.name}
      onSelectedRowIdsChange={setSelected}
      selectable={selectable}
      selectedRowIds={selected}
    />
  );
}

const MANY_PEOPLE: readonly Person[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Person ${String(i + 1).padStart(2, "0")}`,
  age: 20 + i,
}));

export function PaginatedTableStory(): ReactElement {
  return (
    <Table
      aria-label="People"
      columns={COLUMNS}
      data={MANY_PEOPLE}
      defaultPagination={{ pageIndex: 0, pageSize: 5 }}
      getRowId={(p): string => p.id}
    />
  );
}

/**
 * The real consumer shape the R7 acceptance test targets: `data` is a NEW array reference derived
 * (filter+map) during render, not a stable module-level constant, and the parent re-renders while
 * the table sits on a later page. Proves the pageIndex-clamp derivation in table.tsx, not just that
 * it renders once.
 */
interface Score {
  readonly id: string;
  readonly name: string;
  readonly points: number | null;
}

// A column with some BLANK (null) cells — the nulls-last-regardless-of-direction acceptance shape.
// `points` is deliberately out of order and mixes real numbers with nulls so both a stable asc/desc
// primitive ordering AND the null placement are observable.
const SCORES: readonly Score[] = [
  { id: "s1", name: "Alpha", points: 2 },
  { id: "s2", name: "Bravo", points: null },
  { id: "s3", name: "Ciel", points: 3 },
  { id: "s4", name: "Delta", points: null },
  { id: "s5", name: "Echo", points: 1 },
];

const SCORE_COLUMNS: readonly TableColumn<Score>[] = [
  { id: "name", header: "Name", accessor: (s) => s.name },
  { id: "points", header: "Points", accessor: (s) => s.points, align: "end", sortable: true },
];

/** Sortable table over data with null/blank cells — drives the nulls-last acceptance test. The
 * `sorting` is controlled so the test can flip asc/desc without depending on the click cycle. */
export function NullableSortStory({ direction }: { direction: "asc" | "desc" }): ReactElement {
  return (
    <Table
      aria-label="Scores"
      columns={SCORE_COLUMNS}
      data={SCORES}
      getRowId={(s): string => s.id}
      sorting={{ columnId: "points", direction }}
    />
  );
}

export function ShrinkingDataStory(): ReactElement {
  const [count, setCount] = useState(12);
  const data = MANY_PEOPLE.filter((_, i) => i < count).map((p) => ({ ...p }));
  return (
    <div>
      <button data-testid="shrink" onClick={(): void => setCount(3)} type="button">
        shrink
      </button>
      <Table
        aria-label="People"
        columns={COLUMNS}
        data={data}
        defaultPagination={{ pageIndex: 2, pageSize: 5 }}
        getRowId={(p): string => p.id}
      />
    </div>
  );
}
