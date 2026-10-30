import { CtIsolation } from "@orb/testkit/browser";
import type { TableColumn } from "@orb/ui/table";
import { Table } from "@orb/ui/table";
import type { ReactElement } from "react";
import { useState } from "react";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number | null;
}

// A null age and a duplicate-free name column: the sort comparator owns where blanks land.
const PEOPLE: readonly Person[] = [
  { id: "a", name: "Ada", age: 36 },
  { id: "b", name: "Bram", age: null },
  { id: "c", name: "Cleo", age: 29 },
  { id: "d", name: "Dov", age: 41 },
];

const COLUMNS: readonly TableColumn<Person>[] = [
  { id: "name", header: "Name", accessor: (person) => person.name, sortable: true },
  { id: "age", header: "Age", accessor: (person) => person.age, sortable: true },
  { id: "id", header: "Key", accessor: (person) => person.id },
];

export function SortableTableStory(): ReactElement {
  return (
    <CtIsolation subject="Table" isolates="Sort order, aria-sort and the null placement are the primitive's own derivation over its data.">
      <Table aria-label="People" columns={COLUMNS} data={PEOPLE} getRowId={(person): string => person.id} />
    </CtIsolation>
  );
}

/** The caller owns the sort: the table reports the request and renders what it is handed. */
export function ControlledSortTableStory(): ReactElement {
  const [requests, setRequests] = useState(0);
  return (
    <CtIsolation subject="Table" isolates="A controlled sort must report the request without reordering itself.">
      <Table
        aria-label="People"
        columns={COLUMNS}
        data={PEOPLE}
        getRowId={(person): string => person.id}
        onSortingChange={(): void => setRequests(requests + 1)}
        sorting={null}
      />
      <output aria-label="Sort requests">{requests}</output>
    </CtIsolation>
  );
}

export function PagedTableStory(): ReactElement {
  return (
    <CtIsolation subject="Table" isolates="Paging over sorted data is the primitive's own derivation.">
      <Table
        aria-label="People"
        columns={COLUMNS}
        data={PEOPLE}
        defaultPagination={{ pageIndex: 0, pageSize: 3 }}
        defaultSorting={{ columnId: "name", direction: "desc" }}
        getRowId={(person): string => person.id}
      />
    </CtIsolation>
  );
}
