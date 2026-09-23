import { DISABLED_STATE, FOCUS_RING_HAS, tv } from "#lib";

// The slider skin. The control row is h-control-sm so the drag surface meets the ≥44px touch
// floor (§4b axis 3); the visible track stays h-field. Base UI positions Indicator/Thumb inline.
// The header row carries the optional Label + Value readout above the control. The Indicator lives INSIDE
// the track (it is the fill, and wants the rail's clip); the thumbs are the track's SIBLINGS.
export const sliderVariants = tv({
  slots: {
    root: `flex w-full flex-col gap-field ${DISABLED_STATE}`,
    header: "flex w-full items-baseline justify-between gap-row",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
    // `relative` is LOAD-BEARING, not decoration: the thumbs are siblings of the track (slider.tsx —
    // inside the CLIPPING track they rendered as 6px slivers), and Base UI positions each thumb
    // `position:absolute` against its nearest positioned ancestor. The Control's content box is the
    // track's box, so the thumb lands where it always did — now unclipped.
    // THE CONTROL IS INSET BY HALF A THUMB ON BOTH SIDES (side-eye 2026-08-22 P2-8). Base UI centres a
    // thumb ON its value position, so at `min` and `max` the knob hangs half its width outside this box.
    // Measured at a 430px coarse viewport: the max thumb ran 406→430 and the min thumb 0→24 — flush with
    // the screen edge, its grabbable half on the OS edge-swipe bezel. `mx-slider-inset` is exactly that
    // half (`--spacing-slider-inset`), and the `w-full` is GONE with it: the Control is a stretch item of
    // the column-flex root, so `width:auto` fills the row MINUS the margins, where `w-full` + margins
    // would overflow. Percentages resolve against this box, so both extremes move inboard together and
    // the rail simply shortens by one thumb width.
    control: "relative mx-slider-inset flex h-control-sm touch-none select-none items-center",
    // Base UI sets data-invalid on Track (and Control/Thumb) when wrapped in an invalid <Field>
    // (FieldRootState) — the track fill is the visible surface, so it carries the destructive skin.
    track: "relative h-field w-full grow overflow-hidden rounded-full bg-input data-invalid:bg-destructive/20",
    indicator: "rounded-full data-invalid:bg-destructive",
    thumb: [
      // Base UI's Thumb is a decorative div wrapping the real (visually-clipped) native range input and
      // stamps its focus state as `data-focused` — but ONLY when wrapped in a Field.Root (else setFocused
      // is a no-op, so `:focus-visible`/`data-focused` on the thumb never matches for a bare Slider). Key
      // the ring off the nested input's own focus-visible via :has() so EVERY slider rings on keyboard
      // focus (WCAG 2.4.7), Field-wrapped or not (focus-ring.ts _HAS is exactly this shape).
      "size-slider-thumb rounded-full border border-border",
      // THE KNOB'S CENTERING IS LAYOUT, NOT A RESTING TRANSFORM (#1187, design-audit `off-grid-transform`
      // P3 on settings:chat-behavior --mobile). Base UI positions each thumb with an INLINE
      // `inset-inline-start: <pct>%; top: 50%; translate: -50% -50%` (slider/thumb/SliderThumb.js) — a
      // transform that is live at REST, which docs/law/integer-line-boxes.md §9 Law 2 refuses: a transformed box is
      // composited from its own raster at whatever sub-pixel offset it resolves to, instead of being
      // snapped by the paint. The rule's own prescribed repair is "express rest geometry as layout
      // instead", and that is exactly this: the SAME half-a-thumb, spent as margin.
      //
      // MECHANISM CORRECTION, recorded rather than silently followed: #1187 proposed quantizing the
      // translate with `--dimension-device-pixel` (the #1120 family). That cannot be the fix — `-50%` of a
      // 24px knob IS 12px, an integer at every DPR, so the −0.078 device-px landing the audit measured is
      // the vendor's PERCENTAGE inset resolving against a fractional control width, which no round() on
      // the translate can reach. Taking the transform out is the fix that holds: the box lands in the same
      // place, and the browser snaps a laid-out edge where it resamples a transformed raster.
      //
      // `-ms-slider-inset` IS the half-thumb, not a second number: `--spacing-slider-inset` is defined as
      // half of `--spacing-slider-thumb` (the Control's own `mx-slider-inset` above rides the same fact),
      // and margin-inline-START is direction-correct — under RTL the inline start edge is the right one and
      // a negative start margin shifts the box the way Base UI's mirrored `translate: 50%` did. The block
      // axis is physical `-mt` because `orientation` is narrowed OUT of this seal (slider.tsx), so the
      // vendor's cross offset is always `top: 50%`.
      "translate-none! -ms-slider-inset -mt-slider-inset",
      "transition-shadow duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING_HAS,
      "data-invalid:border-destructive",
    ],
  },
  // `tone` is the INHERITED-vs-EXPLICIT axis (the Badge/Switch `tone`
  // precedent). COLOR ONLY — the box (control height, track height, thumb size) stays on the base slots, so
  // a tone can never fight the geometry the touch floor rides on.
  //
  // `default` is the standalone slider's skin: the ember `--primary` fill + the full-weight `--foreground`
  // thumb — the ONE sanctioned accent control on a surface that shows a single slider.
  //
  // `neutral` and `ghost` are the KnobRow pair, and both drop the accent (side-eye F-09, 2026-08-02):
  //  · `neutral` = EXPLICIT. §4.1 rations the ember to focus + the pane's one primary, so a set knob is
  //    signalled by WEIGHT (a 45%-foreground fill + the full-weight thumb — the mock's own explicit row),
  //    not by accent; twelve ember fills in one column was the CD3 budget break the review measured.
  //  · `ghost` = INHERITED, and it paints NO FILL AT ALL. A dimmed fill still draws a bar from the rail's
  //    start to the thumb, so an unset Top-P at its 1.00 model default rendered a FULL grey meter and read
  //    as MORE set than the explicit rows beside it. Bare rail + a HOLLOW thumb sitting at the resolved
  //    effective value keeps the datum legible while carrying no magnitude claim.
  //
  //    THE THUMB IS HOLLOW, NOT MERELY MUTED (side-eye 2026-08-22 P2-3). A tint was the whole distinction,
  //    and it does not survive the state that matters most: an EXPLICIT knob at its minimum draws a
  //    zero-width fill, so at the left rail an unset knob and a true-minimum one differed by nothing but
  //    `muted-foreground` vs `foreground` on a 24px disc — and on a brand-new preset all eight sampling
  //    thumbs sit there at once, reading "everything is turned all the way down" when the truth is
  //    "nothing is set". A RING is a different SHAPE, legible at any position and at any track fill: an
  //    unfilled knob for an unfilled value. The box is untouched (the `tone` axis stays geometry-free —
  //    a 2px border on a `border-box` disc changes no measurement), so a row does not jitter when a value
  //    is promoted from inherited to explicit.
  variants: {
    tone: {
      default: { indicator: "bg-primary", thumb: "bg-foreground" },
      neutral: { indicator: "bg-foreground/45", thumb: "bg-foreground" },
      ghost: { indicator: "bg-transparent", thumb: "border-2 border-muted-foreground bg-transparent" },
    },
  },
  defaultVariants: { tone: "default" },
});
