// The §6.4 regex facet — a PICKER over the owner's script library (D121-E), not an inline array editor.
//
// THIS IS THE F3 FIX, BY CONSTRUCTION. The old field authored scripts into the card's own `regexScripts`
// array while surfacing only name/find/replace/enabled, and defaulted `placement` to `[]` — so a character
// script created in-app could NEVER fire (the executor skips a script whose placement set does not include
// the running leg). The only card scripts that ever worked were the ones imported from an ST card. A picked
// row was authored in the ONE full editor, so it always has a real placement set.
//
// It is not a form field any more: a character's scripts are `character_regex_scripts` junction rows, so
// the attachment is a server write, not draft card content. Hence `characterId`, not `form`.

import type { CharacterId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { RegexScriptPicker } from "#components";

export function CharacterRegexScriptsField({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <RegexScriptPicker
      scope={{ kind: "character", characterId }}
      heading="Regex scripts"
      helperText="Find/replace rules that run whenever this character is in the room, picked from your script library."
    />
  );
}
