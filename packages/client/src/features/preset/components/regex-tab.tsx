// The Regex tab — a PICKER over the owner's script library (D121-E), not an editor over an embedded array.
//
// `PromptConfig.regexScripts` is gone: a preset's regex set is a REFERENCE list (`preset_regex_scripts`),
// so this tab no longer lives on the preset's autosave form at all — it attaches rows, and the attachment
// is its own server write. That is why it takes `presetId` rather than `form`: there is nothing of the
// preset's draft state left in it.
//
// ITS OWN QueryBoundary, deliberately. The picker reads through `useSuspenseQuery`, and the Transforms view
// renders it BESIDE the Delivery / Collapsing / post-process decks. Leaning on the surface-level boundary
// would let one slow library read blank every sibling deck on the tab — which is not a hypothetical: a CT
// caught the whole Delivery group vanishing the moment this became a suspending read. A section that can
// suspend owns a boundary at its own edge.

import type { PresetId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { RegexScriptPicker } from "#components";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import { openSettingsTo } from "#state";

const PICKER_SKELETON_ROWS = 3;
/** The library's own pane + section (the Regex settings surface stamps this anchor). */
const REGEX_LIBRARY_ANCHOR = { category: "regex", sub: "scripts" } as const;

export function RegexTab({ presetId }: { readonly presetId: PresetId }): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your regex scripts" onRetry={retry} />}
    >
      <RegexScriptPicker
        scope={{ kind: "preset", presetId }}
        heading="Regex"
        helperText="Find/replace rules this preset runs, picked from your script library. The CONTEXT readout shows where each stage sits in the pipeline."
        onOpenLibrary={(): void => openSettingsTo(REGEX_LIBRARY_ANCHOR.category, REGEX_LIBRARY_ANCHOR.sub)}
      />
    </QueryBoundary>
  );
}
