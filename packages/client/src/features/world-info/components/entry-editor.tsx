// The full-fidelity entry editor — a button-gated editor binding every contract field of a
// world_entries row, including the at-depth injection opt-in (depth+role reveal only when enabled;
// `position` is moot once injecting since the entry leaves the system half). The metadata blob's
// unknown keys (ST-imported) are preserved by the save mapper. Delete lives here behind an AlertDialog;
// on delete the surface clears the entry selection.

import type { EntryView } from "@orb/contracts/world-info";
import type { WorldEntryId } from "@orb/kit/ids";
import { ENTRY_POSITIONS, ENTRY_SCOPE_MODES } from "@orb/kit/world-info";
import { Button } from "@orb/ui/button";
import { Combobox } from "@orb/ui/combobox";
import { Field } from "@orb/ui/field";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Trash2 fine (the preset-library-row.tsx precedent).
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useEntryForm } from "../hooks/use-entry-form";
import { useRemoveWorldEntry, useUpdateWorldEntry } from "../hooks/use-world-info-mutations";
import type { EntryFormValues } from "../lib/entry-editor-model";
import { entryFormFromEntity, entryUpdateInputFromForm } from "../lib/entry-editor-model";

// The contract cap on `keys` (contracts/world-info KEYS_MAX) — the chip picker enforces it too.
const KEYS_MAX = 500;

const SCOPE_MODE_LABELS: Record<(typeof ENTRY_SCOPE_MODES)[number], string> = {
  auto: "Auto — keyword if it has keys, always if not",
  always: "Always — fires every turn, keys ignored",
  keyword: "Keyword — fires only when a key matches",
};
const SCOPE_MODE_ITEMS: SelectItems<string> = ENTRY_SCOPE_MODES.map((value) => ({
  value,
  label: SCOPE_MODE_LABELS[value],
}));

const POSITION_LABELS: Record<(typeof ENTRY_POSITIONS)[number], string> = {
  before: "Before the character definitions",
  after: "After the character definitions",
};
const POSITION_ITEMS: SelectItems<string> = ENTRY_POSITIONS.map((value) => ({
  value,
  label: POSITION_LABELS[value],
}));

export interface EntryEditorProps {
  readonly entry: EntryView;
  /** Clear the entry selection after a delete (the surface's writer seam → back to the entry list). */
  readonly onDeleted: (id: WorldEntryId) => void;
}

/** The button-gated editor for one lore entry (every field + delete). */
export function EntryEditor({ entry, onDeleted }: EntryEditorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateWorldEntry({ trpc, invalidation });
  const remove = useRemoveWorldEntry({ trpc, invalidation });

  const baseMetadata = entry.metadata;
  const save = async (values: EntryFormValues): Promise<EntryFormValues> => {
    await update.mutateAsync({
      entryId: entry.id,
      input: entryUpdateInputFromForm(values, baseMetadata),
    });
    return values;
  };

  const { form, mountKey } = useEntryForm({
    entityId: entry.id,
    serverValues: entryFormFromEntity(entry),
    save,
  });

  return (
    <form
      key={mountKey}
      onSubmit={(event): void => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack gap="block" padding="block">
        <Row gap="field" align="center" justify="between">
          <Text size="micro" tone="muted" transform="caps">
            Entry
          </Text>
          <DeleteEntryAction
            title={entry.title}
            onDelete={(): void => {
              remove.mutate({ entryId: entry.id });
              onDeleted(entry.id);
            }}
          />
        </Row>

        <form.AppField name="title">
          {(field): ReactElement => (
            <field.TextField
              label="Title"
              hint="A short label for the entry list — never injected into the prompt."
              placeholder="Entry title"
            />
          )}
        </form.AppField>

        <form.AppField name="content">
          {(field): ReactElement => (
            <field.TextareaField
              label="Content"
              description="The lore text spliced into the prompt when this entry fires."
              placeholder="What the model should know…"
              rows={6}
            />
          )}
        </form.AppField>

        <form.AppField name="description">
          {(field): ReactElement => (
            <field.TextareaField
              label="Note"
              description="An author-facing memo (ST's comment) — shown in the list, never sent to the model."
              placeholder="Optional"
              rows={2}
            />
          )}
        </form.AppField>

        {/* Keyword triggers — the built free-text chip Combobox (no `items`: pure free-text entry). */}
        <form.Subscribe selector={(state): readonly string[] => state.values.keys}>
          {(keys): ReactElement => (
            <Field
              label="Keyword triggers"
              description="Enter or comma commits a keyword. Matched case-insensitively, whole-word, against recent messages."
            >
              <Combobox
                aria-label="Keyword triggers"
                value={keys}
                maxItems={KEYS_MAX}
                placeholder="Type a keyword, then Enter"
                onValueChange={(next): void => form.setFieldValue("keys", next)}
              />
            </Field>
          )}
        </form.Subscribe>

        <Row gap="block" align="start">
          <form.AppField name="enabled">
            {(field): ReactElement => (
              <field.SwitchField
                label="Enabled"
                hint="A disabled entry never fires, even when its keywords match."
              />
            )}
          </form.AppField>
          <form.AppField name="ignoreBudget">
            {(field): ReactElement => (
              <field.SwitchField
                label="Always include"
                hint="Bypass the per-turn world-info token budget — must-have lore that's never dropped."
              />
            )}
          </form.AppField>
        </Row>

        <Row gap="block" align="start">
          <form.AppField name="priority">
            {(field): ReactElement => (
              <field.NumberField
                label="Priority"
                hint="Higher sorts first and injects earlier when the budget is tight."
              />
            )}
          </form.AppField>
          <form.AppField name="scopeMode">
            {(field): ReactElement => (
              <field.SelectField label="Fire mode" items={SCOPE_MODE_ITEMS} />
            )}
          </form.AppField>
        </Row>

        {/* At-depth injection opt-in — depth/role reveal only when on; `position` shows only when OFF (an
            injected entry leaves the system half, so the WI anchor bucket is moot). */}
        <form.AppField name="injectEnabled">
          {(field): ReactElement => (
            <field.SwitchField
              label="Inject at a depth in history"
              hint="Splice this entry into the chat history at a depth instead of the system prompt."
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state): boolean => state.values.injectEnabled}>
          {(injectEnabled): ReactElement =>
            injectEnabled ? (
              <Row gap="field" align="start">
                <form.AppField name="injectDepth">
                  {(field): ReactElement => <field.NumberField label="Depth" min={0} />}
                </form.AppField>
                <form.AppField name="injectRole">
                  {(field): ReactElement => (
                    <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} />
                  )}
                </form.AppField>
              </Row>
            ) : (
              <form.AppField name="position">
                {(field): ReactElement => (
                  <field.SelectField
                    label="Placement"
                    hint="Which system-half anchor an always-scope entry joins (needs the preset's WI markers)."
                    items={POSITION_ITEMS}
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
      </Stack>

      <form.AppForm>
        <SaveBar title={entry.title} kind="Entry" sticky="footer">
          <form.DirtyPill />
          <form.SubmitButton>Save entry</form.SubmitButton>
        </SaveBar>
      </form.AppForm>
    </form>
  );
}

/** The delete affordance (a destructive kebab-free inline button → AlertDialog confirm). */
function DeleteEntryAction({
  title,
  onDelete,
}: {
  readonly title: string;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <ConfirmDialog
      confirmLabel="Delete"
      onConfirm={onDelete}
      title={`Delete "${title}"?`}
      trigger={
        <Button intent="ghost" size="sm" aria-label={`Delete ${title}`}>
          <Icon icon={Trash2} size="sm" />
        </Button>
      }
    />
  );
}
