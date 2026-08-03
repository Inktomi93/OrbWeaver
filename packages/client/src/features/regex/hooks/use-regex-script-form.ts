// The per-ROW regex-script autosave form (D121-E). Mounted through the D78 session boundary keyed by the
// script's own id — the library is many rows now, not one owner-global blob, so the entity key is the
// `regex_script_…` id rather than the old fixed `"regex-settings"` singleton.
//
// The form value IS `CreateRegexScriptInput` (the authored fields), which is exactly what the ONE shared
// `RegexEditorDialog` binds — so create and edit drive the identical field set at the identical capability
// level. No draft mirror: the library is server-synced and autosaves within the debounce window.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexPlacement } from "@orb/kit/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { createAutosaveEntityForm } from "#forms";
import { deriveRegexTierFlags } from "../lib/derive-tier-flags.ts";

/** THE DEFAULT SCOPE OF A NEW SCRIPT — the two conversational streams, and only those (side-eye X-9,
 *  2026-08-03). It used to be EVERY placement, which meant pressing `Add script` created a live, enabled
 *  find/replace wired into all five legs of the pipeline — including the world-info assembly and the
 *  reasoning channel — before the user had typed a single character of a pattern. The opposite default is
 *  ruled out for a different reason: an EMPTY placement set is the F3 defect (a script that can never fire,
 *  with nothing on screen saying so). So the default is the smallest set that is both harmless and
 *  useful — what the user says and what the model says back, which is what nearly every real script
 *  rewrites. The other three are one chip away in the editor that opens on the very next frame. */
const DEFAULT_PLACEMENTS: readonly RegexPlacement[] = ["USER_INPUT", "AI_OUTPUT"];

/** A fresh script seeded with the schema defaults. The tier flags are DERIVED from the placement set like
 *  everywhere else (`../lib/derive-tier-flags`), never spelled independently — a hand-written pair here
 *  would be the fourth home for a fact that has one. */
export function makeRegexScriptDefaults(): CreateRegexScriptInput {
  return {
    name: "New script",
    findRegex: "",
    replaceString: "",
    placement: [...DEFAULT_PLACEMENTS],
    enabled: true,
    ...deriveRegexTierFlags(DEFAULT_PLACEMENTS),
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
  };
}

export const RegexScriptForm = createAutosaveEntityForm<CreateRegexScriptInput>({
  defaultValues: makeRegexScriptDefaults(),
});
