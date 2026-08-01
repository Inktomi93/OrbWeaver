// KnobRow — the params deck's knob grammar (preset-surface-redesign.md §4.1, owner decision D4). ONE
// instrument row: label · slider · the EDITABLE mono number twin · reset, with the provenance gloss under
// the track. A feature-local COMPOSITE (§13) over landed primitives — Slider `tone`, NumberField
// `size="inline"`, Button, Text voices; zero new primitives.
//
// WHY THE TWIN: ST's crunch is that every value is a visible, grabbable NUMBER (`<input type=range>` AND
// `<input type=number>` side by side). Both controls here bind the SAME form path — two MODALITIES of one
// control, never two homes (§16 row 12): drag or type, the same field is written.
//
// THE GHOST (F2 dead): an UNSET knob does not hide its number behind "Using the model default." prose. The
// slider sits at the RESOLVED EFFECTIVE value (`preset.resolveEffective` — the real funnel, §4.3) in the
// ghost tone, the twin carries that value as its PLACEHOLDER, and the gloss names the rung (`model
// default` · `← quality (deep)`). The placeholder is deliberate and load-bearing: blank-means-default is
// the STORAGE semantic (§4.1 — the ghost is DISPLAY, never written back), so the field must be genuinely
// EMPTY while showing the effective truth. §1's "blank-means-default with effective placeholders in
// Output" is the landed idiom this generalizes.
//
// TOUCH PROMOTES, RESET DEMOTES: dragging or committing a typed value writes THIS knob's path and nothing
// else; the trailing ↺ clears it back to inherit and is inert (`invisible` — out of the a11y tree and
// unfocusable) while the row is already inherited, so the column never jitters row to row.

import type { PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Icon, Info, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { KnobBinding } from "../lib/capability-panel-model";
import type { EffectiveKnobRow } from "../lib/effective-knobs";
import { clampGloss, knobGhost } from "../lib/effective-knobs";

/** The placeholder for a knob whose funnel reports NO value on this model — the honest empty (§4.3): the
 *  model's own default applies and we do not know the number, so nothing is fabricated. */
const UNKNOWN_DEFAULT_PLACEHOLDER = "default";

export interface KnobRowProps {
  readonly form: AppFormInstance<PromptConfig>;
  /** The `params.*` path both controls bind (§16 row 12 — ONE field, two modalities). */
  readonly name: KnobBinding["field"];
  readonly label: string;
  /** The explanatory prose — what this knob DOES. Rides a hover hint (§4.1): the datum stays visible, the
   *  teaching does not take a line. */
  readonly hint?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Keyboard paging step for a large integer range (PageUp/PageDown) — the §4.1 integer arm. */
  readonly largeStep?: number;
  /** This knob's reading from `preset.resolveEffective`; `undefined` while the read is unavailable. */
  readonly effective?: EffectiveKnobRow | undefined;
  /** The preset's quality dial — names the rung in a `← quality (deep)` gloss. */
  readonly quality?: string | undefined;
}

export function KnobRow(props: KnobRowProps): ReactElement {
  const { form, name, label, hint, min, max, step, largeStep, effective, quality } = props;
  return (
    <form.AppField name={name}>
      {(field): ReactElement => {
        const value = field.state.value as number | undefined;
        const explicit = value !== undefined;
        const ghost = explicit ? null : knobGhost(effective, quality);
        // The clamp gloss stays VISIBLE on an explicit row (decision-load-bearing, §4.1); the ghost's
        // provenance line is the inherited row's.
        const gloss = explicit ? clampGloss(effective, { min, max }) : ghost?.gloss;
        return (
          <Stack gap="tight">
            {/* ONE instrument line: label · track · twin · reset all share a vertical center (the mock's
                ~32px knob row). The provenance rides BELOW as its own line so it cannot push the datum
                cells off that center. */}
            <Row align="center" gap="row">
              <KnobLabel hint={hint} label={label} />

              <Slider
                className="min-w-0 flex-1"
                largeStep={largeStep}
                max={max}
                min={min}
                onValueChange={(next): void => field.handleChange(next)}
                step={step}
                thumbLabels={[`${label} slider`]}
                tone={explicit ? "default" : "ghost"}
                value={value ?? ghost?.value ?? min}
              />

              <NumberField
                aria-label={label}
                max={max}
                min={min}
                onValueChange={(next): void => field.handleChange(next ?? undefined)}
                placeholder={ghost === null ? UNKNOWN_DEFAULT_PLACEHOLDER : String(ghost.value)}
                size="inline"
                step={step}
                value={value ?? null}
              />

              <Button
                aria-label={`Reset ${label} to inherited`}
                className={explicit ? "" : "invisible"}
                intent="ghost"
                onClick={(): void => field.handleChange(undefined)}
                size="icon"
                type="button"
              >
                <Icon icon={RotateCcw} size="xs" />
              </Button>
            </Row>

            {gloss === undefined || gloss === null ? null : (
              <Row gap="row">
                {/* Indented to the track's own column — the provenance belongs to the VALUE, not the name. */}
                <Row className="w-(--width-label-col) shrink-0" />
                <Text as="span" voice="gloss">
                  {gloss}
                </Text>
              </Row>
            )}
          </Stack>
        );
      }}
    </form.AppField>
  );
}

/** The row's LEFT cell: the knob's name plus — when it has explanatory prose — the info-glyph hover hint
 *  (§4.1's rule: the datum stays visible, the teaching costs no line). The `SettingRow`/`Field` hint
 *  anatomy, composed here because a KnobRow's control side is a flexing track, not a docked column. */
function KnobLabel({ label, hint }: { readonly label: string; readonly hint: string | undefined }): ReactElement {
  return (
    <Row align="center" className="w-(--width-label-col) shrink-0" gap="field">
      <Text as="span" voice="label">
        {label}
      </Text>
      {hint === undefined ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button aria-label={`About ${label}`} intent="ghost" size="icon" type="button">
                <Icon icon={Info} size="xs" />
              </Button>
            }
          />
          <TooltipPopup side="top">{hint}</TooltipPopup>
        </Tooltip>
      )}
    </Row>
  );
}
