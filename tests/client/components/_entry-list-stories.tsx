import { EntryListEditor } from "@orb/client/components";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

export function EntryListRebaseStory({ items }: { readonly items: readonly string[] }): ReactElement {
  const [removed, setRemoved] = useState<string | undefined>();
  return (
    <CtClientProviders>
      <EntryListEditor
        heading="Entries"
        helperText="Edit the current entries."
        emptyText="No entries"
        addLabel="Add entry"
        items={items}
        getTitle={(item): string => item}
        getSubtitle={(): string => ""}
        onAdd={(): void => undefined}
        onEdit={(): void => undefined}
        onRemove={(index): void => setRemoved(items[index])}
        editIndex={null}
        renderEditor={(): null => null}
      />
      <output>{removed === undefined ? "Nothing removed" : `Removed ${removed}`}</output>
    </CtClientProviders>
  );
}
