// The Variables tab — a ListRow list over `variables[i]` plus an editor Dialog binding `variables[i].*`
// on the direct-bind form. A variable is a `{{name}}` choice block the user answers at generation time;
// the tab is CRUD over the array (`form.pushFieldValue`/`removeFieldValue`).

import type { ChoiceBlockSpec, PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { VariableEditorDialog } from "./variable-editor-dialog";

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
    <Section heading="Variables">
      <Text size="micro" tone="muted">
        Choice blocks the chat asks you to answer — each fills a matching macro in your prompt.
      </Text>

      <form.Subscribe selector={(state): readonly ChoiceBlockSpec[] => state.values.variables}>
        {(variables): ReactElement => (
          <Stack gap="field">
            {variables.length === 0 ? (
              <Text size="micro" tone="muted">
                No variables yet.
              </Text>
            ) : (
              variables.map((variable, index) => (
                <ListRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: variables are a positional, id-less list (names may collide) edited in place — the index IS the identity (the character-greeting-preview precedent).
                  key={index}
                  title={variable.name === "" ? "Unnamed variable" : variable.name}
                  subtitle={variable.question}
                  clickable={true}
                  onClick={(): void => setEditIndex(index)}
                  actions={
                    <Button
                      intent="ghost"
                      size="sm"
                      onClick={(): void => {
                        void form.removeFieldValue("variables", index);
                      }}
                    >
                      Remove
                    </Button>
                  }
                />
              ))
            )}
            <Row>
              <Button intent="secondary" size="sm" onClick={onAdd}>
                <Icon icon={Plus} size="sm" />
                Add variable
              </Button>
            </Row>
          </Stack>
        )}
      </form.Subscribe>

      {editIndex === null ? null : (
        <VariableEditorDialog
          form={form}
          index={editIndex}
          onClose={(): void => setEditIndex(null)}
        />
      )}
    </Section>
  );
}
