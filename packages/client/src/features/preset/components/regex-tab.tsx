// The Regex tab — a ListRow list over `regexScripts[i]` (a find/replace rule run over prompt/display
// text) plus an editor Dialog binding `regexScripts[i].*`. CRUD over the array via
// `form.pushFieldValue`/`removeFieldValue`.

import type { PromptConfig } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import type { ReactElement } from "react";
import { useState } from "react";
import type { RegexScriptsFormValues } from "#components";
import { EntryListEditor, RegexEditorDialog } from "#components";
import type { AppFormInstance } from "#forms";

type AppForm = AppFormInstance<PromptConfig>;

/** A fresh regex script seeded with the schema defaults (an id so the persisted row is well-formed). */
function makeScript(): RegexScript {
  return {
    id: globalThis.crypto.randomUUID(),
    name: "New script",
    findRegex: "",
    replaceString: "",
    placement: [...REGEX_PLACEMENTS],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
    minDepth: null,
    maxDepth: null,
  };
}

/** The Regex tab — the script list + the editor Dialog (opened per-row / via Add). */
export function RegexTab({ form }: { readonly form: AppForm }): ReactElement {
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const onAdd = (): void => {
    // Capture the PRE-push length: pushFieldValue applies synchronously, so reading `.length`
    // AFTER the push yields one PAST the new item's real index (an out-of-bounds phantom row on Done).
    const newIndex = form.state.values.regexScripts.length;
    form.pushFieldValue("regexScripts", makeScript());
    setEditIndex(newIndex);
  };

  return (
    <form.Subscribe selector={(state): readonly RegexScript[] => state.values.regexScripts}>
      {(scripts): ReactElement => (
        <EntryListEditor
          addLabel="Add script"
          editIndex={editIndex}
          emptyText="No scripts yet."
          getSubtitle={(script): string => (script.enabled ? "enabled" : "disabled")}
          getTitle={(script): string => (script.name === "" ? "Unnamed script" : script.name)}
          heading="Regex"
          helperText="Find/replace rules run over prompt or display text before it's used."
          items={scripts}
          onAdd={onAdd}
          onEdit={setEditIndex}
          onRemove={(index): void => {
            void form.removeFieldValue("regexScripts", index);
          }}
          renderEditor={(index): ReactElement => (
            // The shared dialog binds only `regexScripts[*]`, which PromptConfig carries; TanStack form
            // instances are invariant in their value type, so narrowing this PromptConfig form to the
            // dialog's minimal `RegexScriptsFormValues` shape needs one cast (a library-invariance escape,
            // never an Id launder — runtime-identical, the field paths exist).
            <RegexEditorDialog form={form as unknown as AppFormInstance<RegexScriptsFormValues>} index={index} onClose={(): void => setEditIndex(null)} />
          )}
        />
      )}
    </form.Subscribe>
  );
}
