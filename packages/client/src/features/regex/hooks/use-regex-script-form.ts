// The per-ROW regex-script autosave form (D121-E). Mounted through the D78 session boundary keyed by the
// script's own id — the library is many rows now, not one owner-global blob, so the entity key is the
// `regex_script_…` id rather than the old fixed `"regex-settings"` singleton.
//
// The form value IS `CreateRegexScriptInput` (the authored fields), which is exactly what the ONE shared
// `RegexEditorDialog` binds — so create and edit drive the identical field set at the identical capability
// level. No draft mirror: the library is server-synced and autosaves within the debounce window.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { createAutosaveEntityForm } from "#forms";

/** A fresh script seeded with the schema defaults. `placement` is EVERY placement: a script authored with
 *  no placement can never fire (that was F3 — the character facet's `placement: []` default meant an in-app
 *  card script was unreachable by construction), and every member of the tuple now has a real leg. */
export function makeRegexScriptDefaults(): CreateRegexScriptInput {
  return {
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
  };
}

export const RegexScriptForm = createAutosaveEntityForm<CreateRegexScriptInput>({
  defaultValues: makeRegexScriptDefaults(),
});
