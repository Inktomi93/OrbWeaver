// The Regex tab — a PICKER over the owner's script library (D121-E), not an editor over an embedded array.
//
// `PromptConfig.regexScripts` is gone: a preset's regex set is a REFERENCE list (`preset_regex_scripts`),
// so this tab no longer lives on the preset's autosave form at all — it attaches rows, and the attachment
// is its own server write. That is why it takes `presetId` rather than `form`: there is nothing of the
// preset's draft state left in it.

import type { PresetId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { RegexScriptPicker } from "#components";

export function RegexTab({ presetId }: { readonly presetId: PresetId }): ReactElement {
  return (
    <RegexScriptPicker
      scope={{ kind: "preset", presetId }}
      heading="Regex"
      helperText="Find/replace rules this preset runs, picked from your script library. The CONTEXT readout shows where each stage sits in the pipeline."
    />
  );
}
