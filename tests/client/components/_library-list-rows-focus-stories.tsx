import { ConfirmDialog, LibraryListRows } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

/** A library list whose rows delete behind a confirm, as the Refinery and Databank lists do. */
export function RemovableRowsStory({ ids }: { readonly ids: readonly string[] }): ReactElement {
  const [rows, setRows] = useState(ids);
  return (
    <CtIsolation subject="LibraryListRows" isolates="isolates row-removal focus from authenticated feature data">
      <LibraryListRows empty={<p>No rows.</p>} isEmpty={rows.length === 0} scroll={false}>
        {rows.map((id) => (
          <div key={id}>
            <ConfirmDialog
              confirmLabel="Drop"
              onConfirm={(): void => setRows((current) => current.filter((other) => other !== id))}
              title={`Drop ${id}?`}
              trigger={<Button variant="ghost">{`Drop ${id}`}</Button>}
            />
          </div>
        ))}
      </LibraryListRows>
    </CtIsolation>
  );
}
