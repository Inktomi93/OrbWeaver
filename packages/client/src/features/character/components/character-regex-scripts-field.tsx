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
//
// ITS OWN QueryBoundary (the preset Regex tab's twin, same reason): the picker reads through
// `useSuspenseQuery`, and the facet editor renders it under the shared surface boundary alongside the rest
// of the drill-in. A section that can suspend owns a boundary at its own edge, or one slow library read
// blanks its siblings.

import type { CharacterId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { QueryBoundary, RegexScriptPicker } from "#components";
import { QueryErrorState, SkeletonRows } from "#data";
import { openConfigTo } from "#state";

const PICKER_SKELETON_ROWS = 3;
/** The library's own collection KIND in the Configuration workspace (it left the settings modal at the
 *  config rail's R1 — a section navigation now, not a settings deep link). */
const REGEX_COLLECTION = "regex";

// NO HEADING OF ITS OWN (side-eye X-7, the run's ugliest IA defect). This picker IS the body of a facet
// drill that is already titled `Regex scripts`, sitting beside a CONTEXT inspector whose panel is also
// titled `Regex scripts` — so rendering a third `Regex scripts` heading 65px under the second one put four
// labels for one concept on one screen, with two different explanations of it. The drill header names the
// artifact; this body explains what attaching does, once. (X-7's remaining half — the CONTEXT panel's own
// copy of the heading + subtitle — was cut at the 2026-08-06 sweep; `character-facet-inspector.tsx`'s
// `FACET_CONTEXT_ARMS` is where regex now declares that its context arm carries nothing.)
//
// …AND ONE HELPER SENTENCE, NOT THREE (same sweep). The drill header's subtitle already says WHAT a regex
// script is ("Find/replace passes over the card's text."), so this line says only what it does not: where
// the rows come from and when they fire. It used to open with the same two words.
export function CharacterRegexScriptsField({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your regex scripts" onRetry={retry} />}
      reserveKey="character.regexScripts"
    >
      <RegexScriptPicker
        scope={{ kind: "character", characterId }}
        helperText="Picked from your script library — these run whenever this character is in the room."
        onOpenLibrary={(): void => openConfigTo(REGEX_COLLECTION)}
      />
    </QueryBoundary>
  );
}
