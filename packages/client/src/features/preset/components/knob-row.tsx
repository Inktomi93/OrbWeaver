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
import { useId } from "react";
import type { AppFormInstance } from "#forms";
import type { KnobBinding } from "../lib/capability-panel-model.ts";
import type { EffectiveKnobRow, KnobGhost } from "../lib/effective-knobs.ts";
import { clampGloss, knobGhost } from "../lib/effective-knobs.ts";
import { PRESET_NUMBER_FORMAT } from "../lib/format-count.ts";

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
  // ONE id per row for the provenance line. Both modalities point at it (§4.1's gloss belongs to the
  // VALUE), which is what stops a column of loose glosses from fusing into one run of text for a screen
  // reader — a gloss reads as this row's, or it does not reach the row at all (side-eye F-21).
  const glossId = useId();
  return (
    <form.AppField name={name}>
      {(field): ReactElement => {
        const value = field.state.value as number | undefined;
        // THE ONE DERIVATION (§4.1, the side-eye's "single biggest opportunity"): explicit ⇔ the field
        // carries a value. Everything else — fill vs bare rail, full-weight vs muted, whether the reset
        // exists, whether a provenance line renders — hangs off this and nothing else.
        const explicit = value !== undefined;
        const ghost = explicit ? null : knobGhost(effective, quality);
        // The clamp gloss stays VISIBLE on an explicit row (decision-load-bearing, §4.1); the ghost's
        // provenance line is the inherited row's.
        const gloss = explicit ? clampGloss(effective, { min, max }) : ghost?.gloss;
        const describedBy = gloss === undefined || gloss === null ? undefined : glossId;
        return (
          <Stack gap="tight">
            {/* ONE instrument line: label · track · twin · reset all share a vertical center (the mock's
                ~32px knob row). The provenance rides BELOW as its own line so it cannot push the datum
                cells off that center. */}
            <Row align="center" gap="row">
              <KnobLabel hint={hint} label={label} />
              <KnobControls
                describedBy={describedBy}
                explicit={explicit}
                ghost={ghost}
                label={label}
                largeStep={largeStep}
                max={max}
                min={min}
                onChange={(next): void => field.handleChange(next)}
                step={step}
                value={value}
              />
            </Row>
            <KnobGloss glossId={glossId} text={gloss ?? null} />
          </Stack>
        );
      }}
    </form.AppField>
  );
}

/** The row's THREE datum cells — track, editable twin, reset — all bound to the SAME value, which is what
 *  makes them two modalities of one control rather than three homes (§16 row 12). */
function KnobControls({
  value,
  explicit,
  ghost,
  label,
  min,
  max,
  step,
  largeStep,
  describedBy,
  onChange,
}: {
  readonly value: number | undefined;
  readonly explicit: boolean;
  readonly ghost: KnobGhost | null;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly largeStep: number | undefined;
  readonly describedBy: string | undefined;
  readonly onChange: (next: number | undefined) => void;
}): ReactElement {
  return (
    <>
      <Slider
        className="min-w-0 flex-1"
        largeStep={largeStep}
        max={max}
        min={min}
        onValueChange={(next): void => onChange(next)}
        step={step}
        // The ROLE is not part of the name (side-eye F-27): "Max output tokens slider" restates what
        // `role=slider` already announces.
        thumbLabels={[label]}
        thumbDescribedBy={describedBy}
        // EXPLICIT is the EMBER (owner ruling, 2026-08-02: "sliders WHITE, off-palette too" — one control
        // color grammar with the amber-ON switches beside them). This REVERSES side-eye F-09's `neutral`
        // arm: that call rationed the accent per CD3, but rendered it produced a deck whose set knobs were
        // painted in a grey the app's palette does not otherwise speak, reading as disabled next to an
        // amber switch one cluster up. The ghost arm is untouched — it still paints NO fill at all, which
        // is what carries the inherited-vs-explicit distinction; the accent is now what says "you set this".
        tone={explicit ? "default" : "ghost"}
        value={value ?? ghost?.value ?? min}
      />

      <NumberField
        aria-describedby={describedBy}
        aria-label={label}
        format={PRESET_NUMBER_FORMAT}
        max={max}
        min={min}
        onValueChange={(next): void => onChange(next ?? undefined)}
        placeholder={ghost === null ? UNKNOWN_DEFAULT_PLACEHOLDER : String(ghost.value)}
        size="inline"
        step={step}
        value={value ?? null}
      />

      <Button
        aria-label={`Reset ${label} to inherited`}
        className={explicit ? "" : "invisible"}
        intent="ghost"
        onClick={(): void => onChange(undefined)}
        size="icon"
        type="button"
      >
        <Icon icon={RotateCcw} size="xs" />
      </Button>
    </>
  );
}

/** The provenance/clamp line, indented to the TRACK's column — it belongs to the VALUE, not the name — and
 *  carrying the id both modalities point `aria-describedby` at (side-eye F-21). */
function KnobGloss({ text, glossId }: { readonly text: string | null; readonly glossId: string }): ReactElement | null {
  if (text === null) {
    return null;
  }
  return (
    <Row gap="row">
      <Row className="w-(--width-label-col) shrink-0" />
      <Text as="span" id={glossId} voice="gloss">
        {text}
      </Text>
    </Row>
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
          {/* ONE hint-trigger name across the app (side-eye F-19): `@orb/ui`'s `Field` and `Section` both
              derive `More info about <label>`, and this composite spelled the same affordance
              `About <label>` — two vocabularies for one control, in one pane. The primitives' spelling
              wins; a feature composite does not get its own dialect. */}
          {/* `shrink-0` IS THE TOUCH FLOOR HERE (side-eye R-8, isolated by measurement). `size="icon"` pins
              a `--spacing-control-md` box — 48px on a coarse pointer — but the trigger is a FLEX ITEM in a
              fixed-width label cell, so a long label ate into it: measured under an emulated coarse pointer,
              "Repetition penalty" rendered 44×48, "Max output tokens" 43×48 and "Max context tokens" 42×48,
              i.e. the three longest labels on the deck pushed their own explainer under the 44px floor while
              every short-labelled sibling measured 48×48. A hit target that shrinks with the label length is
              a target whose size depends on copy. The glyph is unaffected — only the box stops yielding. */}
          <TooltipTrigger
            render={
              <Button aria-label={`More info about ${label}`} className="shrink-0" intent="ghost" size="icon" type="button">
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
