// The Variables tab — a ListRow list over `variables[i]` plus an editor Dialog binding `variables[i].*`
// on the direct-bind form. A variable is a `{{name}}` choice block the user answers at generation time;
// the tab is CRUD over the array (`form.pushFieldValue`/`removeFieldValue`). The autosave BOUNDARY's store
// driver persists structural array ops (D78 §3), so add/remove carry NO manual `handleSubmit` flush.

import type { ChoiceBlockSpec, PromptConfig } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { useState } from "react";
import { EntryListEditor } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { notify } from "#lib";
import { VariableEditorDialog } from "./variable-editor-dialog.tsx";

type AppForm = AppFormInstance<PromptConfig>;

/** A fresh choice block seeded with the schema defaults (one blank option so the editor has a row). */
function makeVariable(): ChoiceBlockSpec {
  return {
    name: "new_variable",
    question: "Pick one",
    options: [{ label: "Option", value: "" }],
    multiSelect: false,
    separator: ", ",
    randomPick: false,
  };
}

/** The Variables tab — the choice-block list + the editor Dialog (opened per-row / via Add). */
export function VariablesTab({ form }: { readonly form: AppForm }): ReactElement {
  // The open editor targets a variable INDEX (`null` = closed). Add pushes then opens the new tail.
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const onAdd = (): void => {
    // Capture the PRE-push length: pushFieldValue applies synchronously, so reading `.length`
    // AFTER the push yields one PAST the new item's real index (an out-of-bounds phantom row on Done).
    const newIndex = form.state.values.variables.length;
    form.pushFieldValue("variables", makeVariable());
    setEditIndex(newIndex);
  };

  return (
    <form.Subscribe selector={(state): readonly ChoiceBlockSpec[] => state.values.variables}>
      {(variables): ReactElement => (
        <EntryListEditor
          addLabel="Add variable"
          editIndex={editIndex}
          emptyText="No variables yet."
          getSubtitle={(variable): string => variable.question}
          getTitle={(variable): string => (variable.name === "" ? "Unnamed variable" : variable.name)}
          heading="Variables"
          helperText="Choice blocks the chat asks you to answer — each fills a matching macro in your prompt."
          items={variables}
          onAdd={onAdd}
          onEdit={setEditIndex}
          onRemove={(index): void => {
            form.removeFieldValue("variables", index).catch(() => notify.error("Couldn't remove the variable."));
          }}
          renderEditor={(index): ReactElement => <VariableEditorDialog form={form} index={index} onClose={(): void => setEditIndex(null)} />}
        />
      )}
    </form.Subscribe>
  );
}
