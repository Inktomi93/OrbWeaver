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
//
// THE ONE FACT, ONE ANSWER GATE (side-eye 2026-08-07 P2). On the BUILT-IN default this tab used to spend nine
// seconds on a skeleton and then print "Couldn't load your regex scripts. / Retry" — a failure the Retry
// button can never clear, because the built-in's `ownerId` is null and `ensurePresetOwned` refuses it BY
// CONSTRUCTION (`domain/regex/persistence/ownership.ts`; that refusal is correct and stays). Meanwhile the
// CONTEXT readout 400px to the right answered "off" for the same eight stages off the SAME `attachable` fact
// — one fact, two homes, two different answers. So the fact arrives here as a prop from the one place that
// knows it (the preset row's `isSystemDefault` wire flag, never the sentinel id), and a preset that cannot
// carry attachments renders the REASON instead of a retryable failure over a query that is never fired.

import type { PresetId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { RegexScriptPicker } from "#components";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import { goToCollection } from "#state";

const PICKER_SKELETON_ROWS = 3;
/** The library's own collection KIND in the Configuration workspace (it left the settings modal at the
 *  config rail's R1 — a section navigation now, not a settings deep link). */
const REGEX_COLLECTION = "regex";

/** The deck group's name — spelled ONCE so the picker's heading and the un-attachable arm's group name are
 *  the same string (the reader meets one group either way). */
const REGEX_HEADING = "Regex";

export function RegexTab({ presetId, attachable }: { readonly presetId: PresetId; readonly attachable: boolean }): ReactElement {
  if (!attachable) {
    // NOT a disabled picker and not an empty one: both would render a list of switches that silently refuse
    // every flip. The group keeps its name and its place in the Transforms lane (the readout still prints the
    // regex stages beside it), and says the one true thing plus the way out.
    return (
      <Section kicker={REGEX_HEADING}>
        <Stack gap="field">
          {/* THE WAY OUT IS THE REAL ONE. The built-in row carries no Duplicate action (`preset-library-row`
              gives `actions` only to owned rows) — what actually mints a copy is editing any of its OTHER
              settings, which `preset.update` turns into an owned fork server-side ("Default (edited)",
              `use-preset-autosave.ts`). Naming a Duplicate command that does not exist would be the X-19
              defect this file is fixing, one screen over. */}
          <Text prose={true} voice="gloss">
            The built-in default can't hold regex scripts. Change any of its other settings and your edits are saved as your own copy of it — that copy can
            attach them.
          </Text>
        </Stack>
      </Section>
    );
  }
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your regex scripts" onRetry={retry} />}
    >
      <RegexScriptPicker
        scope={{ kind: "preset", presetId }}
        heading={REGEX_HEADING}
        helperText="Find/replace rules this preset runs, picked from your script library. The CONTEXT readout shows where each stage sits in the pipeline."
        onOpenLibrary={(): void => goToCollection(REGEX_COLLECTION)}
      />
    </QueryBoundary>
  );
}
