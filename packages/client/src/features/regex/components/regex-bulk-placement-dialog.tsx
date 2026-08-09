// The bulk PLACEMENT picker (REGX2 · D2) — the one bulk verb whose target is a SET, not a scalar, so it
// needs a chip picker rather than an inline button. It REPLACES where the selected scripts run: the same
// `Runs on` streams the per-script editor authors (`REGEX_PLACEMENT_ITEMS`, the one shared label map), applied
// to the whole selection. The server re-derives each row's tier flags + history-depth scope from the chosen
// set (`@orb/kit/regex`), so this dialog authors ONLY the placement — the same shape as the editor's chips.
//
// APPLY IS BLOCKED ON AN EMPTY SET, unlike the per-script editor which allows (and warns about) `placement: []`.
// The editor is autosaving mid-keystroke, where a transient empty set is a real state; a bulk Apply is a
// deliberate act, and "set every one of these to run nowhere" is never what that act means — so the empty set
// is a guarded dead end here, stated on the confirm rather than saved and lamented.
//
// It lives in a COMPONENT (the bulk bar mounts it), so its interior Dialog is legal (surface-purity: a surface
// renders no outer Dialog; a component owning its own interior one is fine — the `character-bulk-bar` shape).

import type { RegexPlacement } from "@orb/kit/regex";
import { deriveRegexTierFlags, REGEX_PLACEMENTS } from "@orb/kit/regex";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { REGEX_PLACEMENT_ITEMS } from "#lib";

/** The picker's accessible group name — the editor's own "Runs on" question, phrased for a whole selection. */
const PICKER_LABEL = "Which text streams these scripts run on";

export interface RegexBulkPlacementDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** How many scripts the apply targets — named in the copy the reader can no longer see behind the dialog. */
  readonly count: number;
  /** Fires with the chosen streams (canonical pipeline order) on Apply; the dialog closes itself after. */
  readonly onApply: (placement: RegexPlacement[]) => void;
}

/** "1 script" / "3 scripts" — the subject the copy names (kept local; the bar owns its own copy of the same). */
function scriptCount(n: number): string {
  return `${String(n)} script${n === 1 ? "" : "s"}`;
}

/** Canonicalize the toggle's string set into pipeline-ordered `RegexPlacement`s — filtering through the tuple
 *  both validates (the values ARE the tuple) and fixes the order, so a caller never depends on click order. */
function toPlacement(selected: readonly string[]): RegexPlacement[] {
  return REGEX_PLACEMENTS.filter((member) => selected.includes(member));
}

/** One always-true line under the chips: the empty GUARD, else the DERIVED tier the chosen streams imply —
 *  the same `deriveRegexTierFlags` derivation the row ends up storing, so the reader is shown the consequence
 *  of the chips alone and never told a flag they did not pick. */
function placementHint(placement: readonly RegexPlacement[]): string {
  if (placement.length === 0) {
    return "Pick at least one stream — an empty selection would leave these running nowhere.";
  }
  const { markdownOnly, promptOnly } = deriveRegexTierFlags(placement);
  if (markdownOnly) {
    return "Runs only on the rendered transcript — it never touches the prompt.";
  }
  if (promptOnly) {
    return "Runs only on the prompt — it never touches what is shown.";
  }
  return "Runs on both the prompt and the rendered transcript.";
}

export function RegexBulkPlacementDialog({ open, onOpenChange, count, onApply }: RegexBulkPlacementDialogProps): ReactElement {
  const [selected, setSelected] = useState<string[]>([]);
  const placement = toPlacement(selected);
  const empty = placement.length === 0;

  const close = (): void => {
    setSelected([]);
    onOpenChange(false);
  };

  return (
    <FormDialog
      description={`Choose which text streams to run on. Applies to ${scriptCount(count)}, replacing each one's current selection.`}
      onOpenChange={(next): void => {
        if (!next) {
          setSelected([]);
        }
        onOpenChange(next);
      }}
      open={open}
      submit={{
        label: "Apply",
        onSubmit: (): void => {
          if (!empty) {
            onApply(placement);
            close();
          }
        },
        disabled: empty,
      }}
      title="Where these scripts run"
    >
      <Stack gap="field">
        <ToggleGroup aria-label={PICKER_LABEL} multiple={true} onValueChange={setSelected} value={selected}>
          {REGEX_PLACEMENT_ITEMS.map((item) => (
            <Toggle aria-label={item.label} key={item.value} value={item.value}>
              {item.label}
            </Toggle>
          ))}
        </ToggleGroup>
        {/* One line, always true: the empty guard, else the derived tier the chosen streams imply. */}
        <Text aria-live="polite" voice="gloss">
          {placementHint(placement)}
        </Text>
      </Stack>
    </FormDialog>
  );
}
