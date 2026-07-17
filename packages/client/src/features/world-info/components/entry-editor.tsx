// The full-fidelity entry editor — an AUTOSAVE editor binding every contract field of a world_entries
// row, including the at-depth injection opt-in (depth+role reveal only when enabled; `position` is moot
// once injecting since the entry leaves the system half). The metadata blob's unknown keys (ST-imported)
// are preserved by the save mapper. Delete lives here behind an AlertDialog; on delete the surface clears
// the entry selection.
//
// The editor rides the D78 session boundary (`EntryForm`), mounted at MODULE scope (stable component
// identity, §13.1). The boundary OWNS the entity key: it keys its private Session by `entityId`, so a
// switch to another entry with the editor open is a full teardown/remount seeded from the new entry's row.
// This matters HERE specifically — the book's entry list mounts many entries and the surface swaps the
// `entry` prop on the SAME `EntryEditor` instance (no route/component remount), so without the boundary the
// frozen FormApi would survive an entry switch and one keystroke could autosave entry A's fields into entry
// B (the F1 class, autosave-form-doctrine.md §1/§8). Autosave everywhere (D66 A4 / north-star §7): no
// Save/Discard — the header carries the shared AutosaveStatus (Saved / Saving… / Save failed — Retry) where
// Save used to be. The required title/content (`min(1)`) never spam rejects: the boundary's driver gates on
// `form.state.isValid`, so a half-typed field simply doesn't autosave until it's valid. NO draft mirror:
// on autosave the confirmed server row IS the mirror (the persona/appearance precedent, §13.4 obligation-5).

import type { EntryView } from "@orb/contracts/world-info";
import type { WorldEntryId } from "@orb/kit/ids";
import { ENTRY_POSITIONS, ENTRY_SCOPE_MODES } from "@orb/kit/world-info";
import { Button } from "@orb/ui/button";
import { Combobox } from "@orb/ui/combobox";
import { Field } from "@orb/ui/field";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus, createAutosaveEntityForm } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useRemoveWorldEntry, useUpdateWorldEntry } from "../hooks/use-world-info-mutations";
import type { EntryFormValues } from "../lib/entry-editor-model";
import { entryFormFromEntity, entryUpdateInputFromForm, NEW_ENTRY_FORM } from "../lib/entry-editor-model";

// The contract cap on `keys` (contracts/world-info KEYS_MAX) — the chip picker enforces it too.
const KEYS_MAX = 500;

// The entry session-boundary autosave form (D78). Module-scope so both the boundary and its keyed Session
// have stable identities; the boundary owns the entity key (keyed by entry id), so an entry switch remounts
// the form. No module `config.save`: the persist fn closes over the live tRPC client (a React-context value
// unreachable at module scope) — the surface supplies `save` per-instance.
const EntryForm = createAutosaveEntityForm<EntryFormValues>({ defaultValues: NEW_ENTRY_FORM });

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

/** The autosave editor for one lore entry (every field + delete), mounted through the session boundary. */
export function EntryEditor({ entry, onDeleted }: EntryEditorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateWorldEntry({ trpc, invalidation });

  // The persist fn closes over the entry's existing metadata blob so unknown ST-imported keys ride through.
  const save = async (values: EntryFormValues): Promise<unknown> =>
    update.mutateAsync({
      entryId: entry.id,
      input: entryUpdateInputFromForm(values, entry.metadata),
    });

  return (
    <EntryForm entityId={entry.id} serverValues={entryFormFromEntity(entry)} save={save}>
      {(session): ReactElement => <EntryEditorBody entry={entry} session={session} onDeleted={onDeleted} />}
    </EntryForm>
  );
}

interface EntryEditorBodyProps {
  readonly entry: EntryView;
  readonly session: AutosaveSession<EntryFormValues>;
  readonly onDeleted: (id: WorldEntryId) => void;
}

/** The form-bearing editor body — remounted per entry by the boundary's keyed Session. */
function EntryEditorBody({ entry, session, onDeleted }: EntryEditorBodyProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useRemoveWorldEntry({ trpc, invalidation });
  const { form } = session;

  return (
    <Stack gap="block" padding="block">
      <Row gap="field" align="center" justify="between">
        <Text size="micro" tone="muted" transform="caps">
          Entry
        </Text>
        <Row gap="field" align="center">
          {/* Autosave everywhere (§7): the live status stands where Save used to. */}
          <AutosaveStatus state={session.saveState} onRetry={session.retrySave} />
          <DeleteEntryAction
            title={entry.title}
            onDelete={(): void => {
              remove.mutate({ entryId: entry.id });
              onDeleted(entry.id);
            }}
          />
        </Row>
      </Row>

      <form.AppField name="title">
        {(field): ReactElement => (
          <field.TextField label="Title" hint="A short label for the entry list — never injected into the prompt." placeholder="Entry title" />
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
          <Field label="Keyword triggers" description="Enter or comma commits a keyword. Matched case-insensitively, whole-word, against recent messages.">
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
          {(field): ReactElement => <field.SwitchField label="Enabled" hint="A disabled entry never fires, even when its keywords match." />}
        </form.AppField>
        <form.AppField name="ignoreBudget">
          {(field): ReactElement => (
            <field.SwitchField label="Always include" hint="Bypass the per-turn world-info token budget — must-have lore that's never dropped." />
          )}
        </form.AppField>
      </Row>

      <Row gap="block" align="start">
        <form.AppField name="priority">
          {(field): ReactElement => <field.NumberField label="Priority" hint="Higher sorts first and injects earlier when the budget is tight." />}
        </form.AppField>
        <form.AppField name="scopeMode">{(field): ReactElement => <field.SelectField label="Fire mode" items={SCOPE_MODE_ITEMS} />}</form.AppField>
      </Row>

      {/* At-depth injection opt-in — depth/role reveal only when on; `position` shows only when OFF (an
          injected entry leaves the system half, so the WI anchor bucket is moot). */}
      <form.AppField name="injectEnabled">
        {(field): ReactElement => (
          <field.SwitchField label="Inject at a depth in history" hint="Splice this entry into the chat history at a depth instead of the system prompt." />
        )}
      </form.AppField>
      <form.Subscribe selector={(state): boolean => state.values.injectEnabled}>
        {(injectEnabled): ReactElement =>
          injectEnabled ? (
            <Row gap="field" align="start">
              <form.AppField name="injectDepth">{(field): ReactElement => <field.NumberField label="Depth" min={0} />}</form.AppField>
              <form.AppField name="injectRole">{(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} />}</form.AppField>
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
  );
}

/** The delete affordance (a destructive kebab-free inline button → AlertDialog confirm). */
function DeleteEntryAction({ title, onDelete }: { readonly title: string; readonly onDelete: () => void }): ReactElement {
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
