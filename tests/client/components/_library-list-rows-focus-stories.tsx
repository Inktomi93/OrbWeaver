import { LibraryListRows, LibraryRow, useRowDeleteFocus } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

/**
 * A library list as the Databank draws it: rows in one `VirtualList` inside `LibraryListRows`, each a `LibraryRow` whose
 * delete confirms. A search box shrinks the list, and "Remove elsewhere" drops a row the way a refetch does.
 */
export function RemovableRowsStory({ ids }: { readonly ids: readonly string[] }): ReactElement {
  const [rows, setRows] = useState(ids);
  const [needle, setNeedle] = useState("");
  const listRootRef = useRef<HTMLDivElement>(null);
  const shown = rows.filter((id) => id.includes(needle));
  const rowFocus = useRowDeleteFocus(listRootRef, shown);
  const remove = (id: string): void => setRows((current) => current.filter((other) => other !== id));
  return (
    <CtIsolation subject="LibraryListRows" isolates="isolates row-delete focus from authenticated feature data">
      <div data-slot="story-list-root" ref={listRootRef} tabIndex={-1}>
        <Input aria-label="Search rows" onValueChange={setNeedle} value={needle} />
        <Button onClick={(): void => remove(ids.at(-1) ?? "")} variant="ghost">
          Remove elsewhere
        </Button>
        <LibraryListRows empty={<p>No rows.</p>} isEmpty={shown.length === 0} scroll={true}>
          <div style={{ blockSize: 320 }}>
            <VirtualList
              aria-label="Rows"
              estimateSize={(): number => 64}
              getItemKey={(id): string => id}
              items={shown}
              renderItem={(id): ReactElement => (
                <LibraryRow
                  actions={{ name: `Row ${id}`, ...rowFocus.delete(id, (): void => remove(id)) }}
                  bodyRef={rowFocus.bodyRef(id)}
                  onSelect={(): void => undefined}
                  selected={false}
                  title={`Row ${id}`}
                />
              )}
            />
          </div>
        </LibraryListRows>
      </div>
    </CtIsolation>
  );
}
