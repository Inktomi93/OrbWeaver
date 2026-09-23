// KnobRow — the params deck's knob grammar. ONE
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
//
// A ROW IS GRID CELLS, NOT A BOX (side-eye 2026-08-19 P1-1). It used to be a flex `Row` whose name cell was
// a FIXED `--width-label-col` box: the hint trigger sits in that box too, so the three longest names on the
// deck clipped their own text at EVERY pane width (1864 included), and at a 390px content pane the fixed
// box + the number twin + the reset left the rail 0-28px — a 30px thumb parked on no track at all, ten of
// them at once. Both are the same defect: a control column sized by a token instead of by what it holds.
//
// So `KnobRow` returns a FRAGMENT of cells and `KnobGrid` owns the tracks (`cols="knob"` — its variant
// carries the measurement and the fold). A wrapping element would make the whole row ONE grid item and the
// shared name track would be gone, which is the same reason the databank readout's row returns a fragment.
// Every KnobRow MUST be mounted inside a KnobGrid; the two are exported together from this module so the
// pairing has one home.

import type { PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, RotateCcw } from "@orb/ui/icons";
import { Grid, Row } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { AppFormInstance } from "#forms/editor";
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

/** The tracks a cluster of `KnobRow`s are cells of. ONE per cluster: the name track is content-sized, so
 *  every row inside one grid shares an x by construction, and the fold to a stacked arm is the variant's.
 *  `gap-x-row` / `gap-y-tight` because the two axes are different jobs — the horizontal gap separates a
 *  name from its rail, the vertical one is the deck's own row rhythm. */
export function KnobGrid({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Grid className="items-center gap-x-row gap-y-tight" cols="knob">
      {children}
    </Grid>
  );
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
          // THREE CELLS AND A GLOSS, straight into the parent KnobGrid's tracks (never wrapped — see the
          // header). Wide: name · rail · value-cluster on one line, sharing a vertical center. Folded (two
          // tracks, side-eye 2026-08-30 P2-C): name and value share the first line — so the values read down
          // a right-hand column against the rail's own edge — and the rail takes the whole width beneath
          // them. No cell names a ROW in either arm (they are all cells of ONE grid, so a row index would
          // address every knob at once); the fold is the rail's `col-span-2` plus the grid's dense flow.
          <>
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
            <KnobGloss glossId={glossId} text={gloss ?? null} />
          </>
        );
      }}
    </form.AppField>
  );
}

/** The row's datum controls — track, editable twin, reset — all bound to the SAME value, which is what
 *  makes them two modalities of one control rather than three homes (§16 row 12).
 *
 *  TWO GRID CELLS, not three: the rail is the flexing track and the twin+reset ride together as ONE value
 *  cluster. That pairing is what the folded arm needs — the twin has to land UNDER the rail with its reset
 *  still beside it, and three independent cells would stack the reset onto a fourth line of its own. */
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
        // `min-w-0` is the GRID-ITEM floor override (a track's item is `min-width:auto` by default, which
        // is what lets a rail refuse to shrink and push the row wide). The old `flex-1` went with the flex
        // row this used to be — in a `1fr` track the rail already takes the middle.
        //
        // FOLDED, THE RAIL TAKES ITS OWN LINE UNDER THE PAIR (side-eye 2026-08-30 P2-C). This span is the
        // ONLY placement the folded arm states: it cannot fit beside the name in a two-track row, so it
        // starts the line below — and the grid's dense flow then backfills the value cell into the hole it
        // left beside the name (`@orb/ui`'s `knob` recipe carries the why). The DOM order is untouched in
        // both arms, which is what keeps the reading order the eye's order.
        className="min-w-0 @max-lg:col-span-2"
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

      {/* The value cluster — ONE cell (see this function's note). `justify="end"` so a folded row's number
          still reads down the same edge the rail ends at.
          FOLDED, IT RIDES THE LABEL'S LINE (side-eye 2026-08-30 P2-C): row 1, second track, ending on the
          RAIL'S edge — where a stacked cell of its own had only the row's whole width and floated 54px short
          of everything. `me-slider-inset` is what makes that edge the rail's and not the row's: the Slider's
          CONTROL is deliberately inset by half a thumb on both sides (its own `mx-slider-inset`, side-eye
          2026-08-22 P2-8 — at the extremes the knob hangs half outside its box, and flush to a phone's edge
          it sat on the OS swipe bezel). Matching that margin is what makes the column's outer edge and the
          rail's outer edge the SAME x; the label needs no twin of it, since a track's start already sits at
          the row's start. `data-slot` because the alignment IS the finding: the receipt is
          `knob-value.right === slider-control.right`, and a cluster with no name cannot be measured.
          AND THE RESET SITS ON THE NUMBER'S LEFT WHILE FOLDED. The column the eye tracks is the NUMBERS, and
          the reset holds a reserved slot on every row whether or not it is visible (the no-jitter rule two
          functions up) — so with the reset trailing, the numbers stopped ~54px short of the rail's end and
          the finding survived its own fix. Reversed, the number is what ends on the rail's edge and the
          reserved slot falls inboard, where it costs nothing and still never jitters. It is a CSS order, not
          a DOM one: the reading order stays name → value → its reset, which is the order the pair means. */}
      <Row align="center" data-slot="knob-value" gap="field" justify="end" className="@max-lg:me-slider-inset @max-lg:flex-row-reverse">
        <NumberField
          aria-describedby={describedBy}
          // THE TWIN IS NOT THE SLIDER (side-eye 2026-08-19 P1-2). Both modalities carried the IDENTICAL
          // accessible name, so a screen-reader walk of the deck met "Temperature" twice per row with no way
          // to tell the draggable rail from the typable box — and the empty one from the one showing a
          // number. They stay ONE field (§16 row 12, one write path); what differs is which INSTRUMENT you
          // are on, so the name says that. `<label> value` and not "<label> number field": the ROLE is the
          // role's job to announce (F-27), and `value` is what this box is — the exact datum, typed.
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
      </Row>
    </>
  );
}

/** The provenance/clamp line — it belongs to the VALUE, not the name — carrying the id both modalities point
 *  `aria-describedby` at (side-eye F-21).
 *
 *  IT IS A GRID CELL PLACED IN THE RAIL'S COLUMN, not a row with a spacer box in front of it. The spacer was
 *  a second copy of the fixed label width, so it inherited every defect that width had: it stayed 152px wide
 *  while the name beside it grew, and at a narrow pane it ate the gloss's own line. `col-start-2` puts the
 *  line under the rail wherever the rail is; folded it takes the whole width of the row BELOW the rail
 *  (side-eye 2026-08-30 P2-C — the folded arm is two tracks now, so the row it is "given" has to be said). */
function KnobGloss({ text, glossId }: { readonly text: string | null; readonly glossId: string }): ReactElement | null {
  if (text === null) {
    return null;
  }
  return (
    <Text as="span" className="@max-lg:col-span-2 @lg:col-span-2 @lg:col-start-2" id={glossId} voice="gloss">
      {text}
    </Text>
  );
}

/** The row's LEFT cell: the knob's name plus — when it has explanatory prose — the info-glyph hover hint
 *  (§4.1's rule: the datum stays visible, the teaching costs no line). The `SettingRow`/`Field` hint
 *  anatomy, composed here because a KnobRow's control side is a flexing track, not a docked column. */
function KnobLabel({ label, hint }: { readonly label: string; readonly hint: string | undefined }): ReactElement {
  return (
    // THE HINT COLUMN IS A COLUMN (side-eye 2026-08-19 P3). The glyph used to sit immediately after the
    // label text, so it landed wherever each name happened to end and ragged across the whole label cell —
    // eleven explainers on eleven different x's in one scanned column. `justify-between` docks it at the
    // cell's trailing edge, which is one x for every row and the same edge the track starts at.
    //
    // THE CELL IS THE GRID'S TRACK NOW (side-eye 2026-08-19 P1-1), not a `w-(--width-label-col)` box of its
    // own: the track is `minmax(--width-label-col, max-content)`, so this keeps the token's one-edge column
    // wherever the names fit it and grows past it where they do not. The name accordingly does NOT truncate
    // — a content-sized track has nothing to truncate against, and the clipping this fixes ("Max output
    // tokens", "Max context tokens", at every width) was the box, never the string.
    <Row align="center" className="min-w-0" gap="field" justify="between">
      <Text as="span" voice="label">
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
