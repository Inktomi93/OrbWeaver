// The Variables tab — a ListRow list over `variables[i]` plus an editor Dialog binding `variables[i].*`
// on the direct-bind form. A variable is a `{{name}}` choice block the user answers at generation time;
// the tab is CRUD over the array (`form.pushFieldValue`/`removeFieldValue`). The autosave BOUNDARY's store
// driver persists structural array ops (D78 §3), so add/remove carry NO manual `handleSubmit` flush.

import type { ChoiceBlockSpec } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { useState } from "react";
import { EntryListEditor } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { notify } from "#lib";
import type { PresetEditorValues } from "../lib/preset-editor-values.ts";
import { VariableEditorDialog } from "./variable-editor-dialog.tsx";

type AppForm = AppFormInstance<PresetEditorValues>;

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
  const [editId, setEditId] = useState<string | null>(null);

  const onAdd = (): void => {
    const variable = makeVariable();
    const ids = { id: crypto.randomUUID(), options: variable.options.map(() => crypto.randomUUID()) };
    form.pushFieldValue("variables", variable);
    form.pushFieldValue("variableRowIds", ids);
    setEditId(ids.id);
  };

  return (
    <form.Subscribe selector={(state): PresetEditorValues => state.values}>
      {(values): ReactElement => (
        <EntryListEditor
          addLabel="Add variable"
          editIndex={
            editId === null || !values.variableRowIds.some((row) => row.id === editId) ? null : values.variableRowIds.findIndex((row) => row.id === editId)
          }
          emptyText="No variables yet."
          getSubtitle={(variable): string => variable.question}
          getTitle={(variable): string => (variable.name === "" ? "Unnamed variable" : variable.name)}
          heading="Variables"
          helperText="Choice blocks the chat asks you to answer — each fills a matching macro in your prompt."
          items={values.variables}
          getKey={(_variable, index): string | undefined => values.variableRowIds[index]?.id}
          onAdd={onAdd}
          onEdit={(index): void => setEditId(values.variableRowIds[index]?.id ?? null)}
          onRemove={(index): void => {
            Promise.all([form.removeFieldValue("variables", index), form.removeFieldValue("variableRowIds", index)]).catch(() =>
              notify.error("Couldn't remove the variable."),
            );
          }}
          renderEditor={(index): ReactElement => (
            <VariableEditorDialog key={values.variableRowIds[index]?.id} form={form} index={index} onClose={(): void => setEditId(null)} />
          )}
        />
      )}
    </form.Subscribe>
  );
}
