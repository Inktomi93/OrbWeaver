// The Macros tab (WAVE MU, §12A.5) — CRUD over `userMacros[i]` (the Variables-tab EntryListEditor idiom:
// list + editor Dialog on the direct-bind form; the autosave BOUNDARY's store driver persists structural
// array ops, D78 §3 — no manual flush) + the Macro browser (the ONE-metadata-table consumer) in a
// disclosure underneath that is OPEN by default (#859 T-3 — the reasoning and the measurement it
// supersedes are at the `Collapsible` itself).
//
// The editor Dialog itself is client-shared (`#components/user-macro-editor-dialog`): owner ruling #20 gave
// user macros a SECOND authoring home (a game's `config.userMacros`, edited on the rpg GM console), and both
// homes write the same `UserMacroSpec` — one anatomy, two mounts.

import { userMacroSchema } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { UserMacrosFormValues } from "#components";
import { EntryListEditor, UserMacroEditorDialog } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { notify, withUserMacros } from "#lib";
import { newMacroRowIds } from "../../../components/user-macro-editor-model.ts";
import type { PresetEditorValues } from "../lib/preset-editor-values.ts";
import { MacroBrowser } from "./macro-browser.tsx";

type AppForm = AppFormInstance<PresetEditorValues>;

export interface UserMacrosTabProps {
  readonly form: AppForm;
  /** The owning preset id — the browser's source attribution (`preset:<id>`). */
  readonly presetId: PresetId;
}

/** The Macros tab — the user-macro list + editor Dialog, and the macro browser disclosure. */
export function UserMacrosTab({ form, presetId }: UserMacrosTabProps): ReactElement {
  const [editId, setEditId] = useState<string | null>(null);

  const onAdd = (): void => {
    // The fresh macro is minted THROUGH the schema — every other field is a schema default, never re-spelled.
    const macro = userMacroSchema.parse({ name: "new_macro", body: "" });
    const ids = newMacroRowIds(macro);
    form.pushFieldValue("userMacros", macro);
    form.pushFieldValue("macroRowIds", ids);
    setEditId(ids.id);
  };

  return (
    <form.Subscribe selector={(state): PresetEditorValues => state.values}>
      {(values): ReactElement => (
        <Stack gap="block">
          <EntryListEditor
            addLabel="Add macro"
            editIndex={
              editId === null || !values.macroRowIds.some((row) => row.id === editId) ? null : values.macroRowIds.findIndex((row) => row.id === editId)
            }
            emptyText="No macros yet."
            getSubtitle={(macro): string => macro.description}
            getTitle={(macro): string => (macro.name === "" ? "Unnamed macro" : `{{${macro.name}}}`)}
            heading="User macros"
            helperText="Your own template macros — call one anywhere macros resolve. Args and typed inputs bind by name inside the template."
            items={values.userMacros}
            getKey={(_macro, index): string | undefined => values.macroRowIds[index]?.id}
            onAdd={onAdd}
            onEdit={(index): void => setEditId(values.macroRowIds[index]?.id ?? null)}
            onRemove={(index): void => {
              Promise.all([form.removeFieldValue("userMacros", index), form.removeFieldValue("macroRowIds", index)]).catch(() =>
                notify.error("Couldn't remove the macro."),
              );
            }}
            renderEditor={(index): ReactElement => (
              // The shared dialog binds only `userMacros[*]`, which PromptConfig carries; TanStack form
              // instances are invariant in their value type, so narrowing this PromptConfig form to the
              // dialog's minimal `UserMacrosFormValues` shape needs one cast (the RegexEditorDialog
              // precedent — a library-invariance escape, never an Id launder; the field paths exist).
              <UserMacroEditorDialog
                key={values.macroRowIds[index]?.id}
                form={form as unknown as AppFormInstance<UserMacrosFormValues>}
                index={index}
                onClose={(): void => setEditId(null)}
                // A macro body completes against the preset's OWN macros too (they compose — one macro
                // calling another is the point of a template), so the editor offers the plane it is editing.
                suggestions={withUserMacros(values.userMacros)}
              />
            )}
          />
          {/* OPEN BY DEFAULT (#859 T-3, side-eye 2026-08-30 rail-presets delta). Measured on an isolated
              stage at 1280×800 with a fresh library: the Data view's CONTENT ended at y≈535 of a 752px pane
              and its CONTEXT at y≈232 of 800 — two empty states, a lead sentence and one closed disclosure
              in a pane two thirds void, on a tab whose copy is good and whose surface still read unbuilt.
              The one thing that fills it is the tab's OWN content: this browser is the catalogue of every
              macro the preset's evaluation would see, i.e. the reference you need OPEN while writing the
              variables and macros the two lists above create. Opening it changes no layout and adds no copy.

              THIS SUPERSEDES THIS FILE'S OWN "closed-by-default disclosure underneath" (the header's
              original description, now amended), and it lands on the side the house has already ruled for
              once: `preset-structure-tabs.tsx` records F6 — "a closed disclosure is where a knob goes to
              die" — as the reason DELIVERY and COLLAPSING stay open kicker clusters. Reference material is
              not a knob, which is why this was defensible closed; the emptiness of the pane it sits in is
              what changed. It stays a Collapsible, so a reader who wants the tab short still closes it. */}
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger>
              <Text voice="label">Macro browser</Text>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <MacroBrowser userMacros={values.userMacros} presetId={presetId} />
            </CollapsiblePanel>
          </Collapsible>
        </Stack>
      )}
    </form.Subscribe>
  );
}
