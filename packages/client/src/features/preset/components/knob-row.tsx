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
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
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

/** What an INHERITED thumb announces instead of its number (side-eye 2026-08-19 P1-2).
 *
 *  Two arms, exactly like the visible placeholder beside it: with a funnel reading, the number is real but it
 *  is the RESOLVED one and not this preset's, so it is announced as what it is; with none, there is no number
 *  at all and the thumb's `min` position is an artefact of having to park it somewhere. Both spell "default
 *  (model decides)" so the two arms of one state read as one state. */
function inheritedValueText(ghost: KnobGhost | null): string {
  return ghost === null ? "default (model decides)" : `${String(ghost.value)} — default (model decides)`;
}

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
        // THE INHERITED THUMB DOES NOT ANNOUNCE A NUMBER (side-eye 2026-08-19 P1-2). While the pair is empty
        // the position is a DISPLAY of the funnel's reading, never a value this preset holds — and where the
        // funnel reports nothing the thumb sits at `min`, so the native range announced a bare `0` for eight
        // knobs at once ("everything at minimum", the opposite of the truth). The visible arm already said it
        // (bare rail + muted thumb, `tone="ghost"`); this is the same sentence in the a11y tree.
        {...(explicit ? {} : { thumbValueText: inheritedValueText(ghost) })}
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
        // THE TWIN IS NOT THE SLIDER (side-eye 2026-08-19 P1-2). Both modalities carried the IDENTICAL
        // accessible name, so a screen-reader walk of the deck met "Temperature" twice per row with no way to
        // tell the draggable rail from the typable box — and the empty one from the one showing a number.
        // They stay ONE field (§16 row 12, one write path); what differs is which INSTRUMENT you are on, so
        // the name says that. `<label> value` and not "<label> number field": the ROLE is the role's job to
        // announce (F-27), and `value` is what this box is — the exact datum, typed.
        aria-label={`${label} value`}
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
    // THE HINT COLUMN IS A COLUMN (side-eye 2026-08-19 P3). The glyph used to sit immediately after the
    // label text, so it landed wherever each name happened to end and ragged across the whole 152px label
    // cell — eleven explainers on eleven different x's in one scanned column. `justify-between` docks it at
    // the cell's trailing edge, which is one x for every row and the same edge the track starts at.
    <Row align="center" className="w-(--width-label-col) shrink-0" gap="field" justify="between">
      <Text as="span" className="min-w-0 truncate" voice="label">
        {label}
      </Text>
      {hint === undefined ? null : (
        // ONE HINT ANATOMY (side-eye 2026-08-19 P3 + F-19). This composite hand-rolled the Tooltip +
        // ghost-Button + Info-glyph trio that `@orb/ui`'s `HintTrigger` already IS — the atom `Field` and
        // `Section` both render — so the deck carried two implementations of one affordance and derived its
        // accessible name twice. The primitive owns the name (`More info about <label>`) and the popup; only
        // the SIZE is stated here.
        //
        // `size="icon"` IS THE TOUCH FLOOR (side-eye R-8, isolated by measurement): it pins a
        // `--spacing-control-md` box — 48px on a coarse pointer — where the primitive's `inline` default is a
        // glyph-sized box. `shrink-0` is the other half: the trigger is a FLEX ITEM in a fixed-width label
        // cell, and a long label used to eat into it ("Repetition penalty" rendered 44×48, "Max output
        // tokens" 43×48, "Max context tokens" 42×48 — the three longest labels pushed their own explainer
        // under the 44px floor while every short-labelled sibling measured 48×48). A hit target that shrinks
        // with the label length is a target whose size depends on copy.
        //
        // THIS IS THE SIZE THE DECK KEEPS, and it is deliberately NOT unified downward with the `Field`
        // hints beside it (which render the primitive's `inline` box): matching them would mean re-breaking
        // the 44px floor R-8 measured, and matching them UPWARD is a change to `Field` — every hinted field
        // in the app — which `@orb/ui`'s Section header already records as its own reviewed pass.
        <HintTrigger className="shrink-0" hint={hint} size="icon" subject={label} />
      )}
    </Row>
  );
}
