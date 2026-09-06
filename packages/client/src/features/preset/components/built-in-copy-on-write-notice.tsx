// The built-in default's COPY-ON-WRITE RULE, stated where the edit happens (side-eye 2026-08-30 P2-A, #856).
//
// WHY IT EXISTS. The built-in is the only preset a fresh install has, so it is where every new user starts,
// and the editor presents it as a fully editable preset — ten live sliders, live comboboxes, a live autosave
// chip — while the first edit quietly makes something else and leaves the thing being edited untouched. The
// mechanism was explained in exactly ONE place in the whole surface: a paragraph inside the Transforms tab's
// Regex section (`regex-tab.tsx`), which a user editing a slider on Params never sees. This is that same fact
// on every tab, above the body it applies to.
//
// IT IS THE FOREWARNING HALF ONLY. The other half — what happened, after it happens — is the fork
// announcement over the `notify` seam (`lib/active-preset-notice.ts`, fired by `use-preset-autosave.ts`).
// Neither replaces the other: a notice nobody reads before acting is not a substitute for feedback, and
// feedback after an unexpected act is not a substitute for saying so first.
//
// TWO ARMS, because the copy's fate differs and the sentence must not claim the wrong one. The fork INHERITS
// the active pick when the built-in was what was active (owner ruling 2026-08-30, `use-preset-autosave.ts`'s
// retarget) — so on the first-run state the honest promise is that the copy becomes the active preset; where
// something else is active, all the user is told is that the editor follows them to the copy.
//
// A `role="note"` gloss, not a Card or an alert: the same anatomy the analytics scope statement uses
// (`features/stats/components/library-scope-notice.tsx`). It is a standing property of the artifact, not an
// error and not a state change, so it must not wear the weight of one.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** `active` = this built-in is the ACTIVE-for-generation pick (the `defaultPresetId === null` reading the
 *  editor header and the list row both take). It decides which promise the second clause makes. */
export function BuiltInCopyOnWriteNotice({ active }: { readonly active: boolean }): ReactElement {
  return (
    // `prose` states the LENGTH (step + leading) and deliberately carries no width — the measure is the
    // paragraph's own, and `@orb/ui`'s text variants say to pair the two. Unpaired it ran the editor's whole
    // content column: `design-audit` filed a P3 `line-length` here at 97 characters (60 CSS ch) against the
    // 80-character ceiling, on the same Params arm as #1770's row-voids. `--reading-measure-prose` is the
    // TEACHING/BODY measure (#1145) and resolves in this element's own font, which is why it sits here and
    // not on a wrapper.
    <Text className="max-w-(--reading-measure-prose)" data-slot="preset-built-in-notice" prose={true} role="note" voice="gloss">
      This is the built-in default, and editing it never changes it. Your first edit saves your own copy of it
      {active ? ", and that copy becomes your active preset." : ", and the editor follows you to the copy."}
    </Text>
  );
}
