// The Macros tab (WAVE MU, §12A.5) — CRUD over `userMacros[i]` (the Variables-tab EntryListEditor idiom:
// list + editor Dialog on the direct-bind form; the autosave BOUNDARY's store driver persists structural
// array ops, D78 §3 — no manual flush) + the Macro browser (the ONE-metadata-table consumer) in a
// closed-by-default disclosure underneath.

import type { PromptConfig, UserMacroSpec } from "@orb/contracts/preset";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { EntryListEditor } from "#components";
import type { AppFormInstance } from "#forms";
import { MacroBrowser } from "./macro-browser";
import { UserMacroEditorDialog } from "./user-macro-editor-dialog";

type AppForm = AppFormInstance<PromptConfig>;

/** A fresh user macro seeded with the schema defaults. */
function makeUserMacro(): UserMacroSpec {
  return { name: "new_macro", description: "", args: [], body: "", inputs: [], strict: false };
}

export interface UserMacrosTabProps {
  readonly form: AppForm;
  /** The owning preset id — the browser's source attribution (`preset:<id>`). */
  readonly presetId: string;
}

/** The Macros tab — the user-macro list + editor Dialog, and the macro browser disclosure. */
export function UserMacrosTab({ form, presetId }: UserMacrosTabProps): ReactElement {
  // The open editor targets a macro INDEX (`null` = closed). Add pushes then opens the new tail.
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const onAdd = (): void => {
    // Capture the PRE-push length (pushFieldValue applies synchronously — the Variables-tab off-by-one).
    const newIndex = form.state.values.userMacros.length;
    form.pushFieldValue("userMacros", makeUserMacro());
    setEditIndex(newIndex);
  };

  return (
    <form.Subscribe selector={(state): readonly UserMacroSpec[] => state.values.userMacros}>
      {(userMacros): ReactElement => (
        <Stack gap="block">
          <EntryListEditor
            addLabel="Add macro"
            editIndex={editIndex}
            emptyText="No macros yet."
            getSubtitle={(macro): string => macro.description}
            getTitle={(macro): string => (macro.name === "" ? "Unnamed macro" : `{{${macro.name}}}`)}
            heading="User macros"
            helperText="Your own template macros — call one anywhere macros resolve. Args and typed inputs bind by name inside the template."
            items={userMacros}
            onAdd={onAdd}
            onEdit={setEditIndex}
            onRemove={(index): void => {
              void form.removeFieldValue("userMacros", index);
            }}
            renderEditor={(index): ReactElement => <UserMacroEditorDialog form={form} index={index} onClose={(): void => setEditIndex(null)} />}
          />
          <Collapsible>
            <CollapsibleTrigger>
              <Text size="label" weight="medium">
                Macro browser
              </Text>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <MacroBrowser userMacros={userMacros} presetId={presetId} />
            </CollapsiblePanel>
          </Collapsible>
        </Stack>
      )}
    </form.Subscribe>
  );
}
