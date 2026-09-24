import { ACCENT_HOVER, CHIP_BOX, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, FOCUS_RING_ON_SELECTED, TOUCH_TARGET_PSEUDO, tv } from "#lib";

// Sizes ride the control-height tokens (CONTROL_SIZE, shared with Toggle) so the ≥44px touch floor
// holds by construction; button adds `icon`, `media`, `wrap`, `inline` and the four-step `glyph-*` ramp on
// top. The size axis is the SOLE owner of the box: no other variant (and no call-site class) may set a
// height. The reason INVERTED at #146 and the rule is unchanged either way: the control-height tokens used
// to be opaque to tailwind-merge, so a second height resolved by stylesheet order; now the spacing scale is
// registered, so a second height resolves LAST-WINS and a call-site class silently beats the sealed box.
// Unresolvable then, silently overridable now — a size still belongs on this axis, with the
// `ui-size-via-variant` gate as the enforcer. The two arms that step OUTSIDE the control ramp (`inline`, `glyph-*`)
// therefore owe their own hit-area ::before — the box shrinks, the touch target does not.
/** One step of the `glyph-*` ramp: a square display box (never a control height, never pointer-narrowed)
 *  plus the hit-area ::before that carries the pointer-conditional touch floor the box itself is under.
 *  `shrink-0` is part of the SIZE promise, not a call-site layout choice — every one of these lives in a
 *  flex row, and a square that shrinks is no longer the box the token names. The step class is passed as a
 *  WHOLE literal from each arm below so Tailwind's scanner still sees it (it never assembles class names).
 *
 *  THE HIT AREA IS `::before`, AND IT HAD TO MOVE (#1843). It was an `::after`, and so is the primary CTA's
 *  gradient ring (`globals.css [data-slot="button"][data-cta]::after`) — which is UNLAYERED, so it beat
 *  these utilities outright: on a `data-cta` glyph button the one `::after` painted the ring at `inset: 0`
 *  with `pointer-events: none`, and the touch target vanished entirely (measured: a 16px hit at a fine
 *  pointer where the ghost twin kept 28). One pseudo cannot be both a brand mark and a tap surface.
 *  `::before` is the house home for this anyway — `TOUCH_TARGET_PSEUDO` (lib/selection-control.ts) has
 *  always lifted checkbox/radio/switch there, and Button was the outlier. */
function glyphBox(box: string): string[] {
  return [box, "relative shrink-0 p-0", TOUCH_TARGET_PSEUDO];
}

export const buttonVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap font-sans font-medium",
    // Tailwind v4 `scale-*` sets the standalone `scale` CSS property, not the transform matrix, so the
    // transition must name `scale` — `transition-[...transform]` would not animate it.
    "transition-[scale] duration-(--motion-fast) ease-out-expo active:scale-95",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "aria-busy:cursor-progress",
  ],
  variants: {
    intent: {
      primary: "bg-primary text-primary-foreground shadow-cta hover:bg-primary/90 hover:shadow-cta-glow active:bg-primary/80",
      secondary: `border border-border bg-transparent text-current ${ACCENT_HOVER} active:bg-accent/80`,
      ghost: `text-current ${ACCENT_HOVER} active:bg-accent/80`,
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
      // THE RESTING HAIRLINE (added 2026-08-17, program #102 variant B) — `ghost`'s ink with `secondary`'s
      // edge, which is the one combination the intent axis could not spell and the one a FILTER CHIP needs.
      //
      // Why it is not either neighbour: `secondary` is a real secondary ACTION, so its border reads as a
      // button you press — wrong for twenty-eight words out of a tag dictionary that must recede. `ghost`
      // draws NO edge at all, and an edge is exactly what was missing: the characters pane's chips already
      // sat at a ratified radius and nobody could tell,
      // because at rest they were transparent with a ZERO-width border (measured 2026-08-17,
      // characters-mockups rationale §1). A radius differentiates nothing unless
      // something paints it, so the shape axis only starts working once the pill is drawn.
      outline: `border border-border bg-transparent text-current ${ACCENT_HOVER} active:bg-accent/80`,
    },
    size: {
      ...CONTROL_SIZE,
      // `shrink-0` on both square arms, for the `glyphBox` reason: a square that shrinks in a crowded row is no
      // longer its control box, and at a coarse pointer it falls under the tap floor.
      icon: "size-control-md shrink-0 p-0",
      // The `icon` arm's SMALLER step — the `sm` control height as a SQUARE, for an icon-only control that
      // sits in an `sm`-scaled row (the credentials role-status dot) and would otherwise be a control-height
      // box with `px-block` of dead width on each side of an 8px dot. It is a CONTROL step, not a `glyph-*`
      // one: `--spacing-control-sm` is POINTER-CONDITIONAL (44px coarse / 32px fine), so the box IS the tap
      // floor and needs none of the `glyph-*` ramp's hit-area pseudo — which is exactly why the one live
      // site could not use `glyph-lg` (a pointer-INDEPENDENT 32px display box) without shrinking its visible
      // target at a coarse pointer by 12px. Added at #169, geometry-PRESERVING: byte-identical to the
      // `size-control-sm p-0` className it replaces, which was invisible to `ui-size-via-variant` for as
      // long as that gate's value class rejected hyphens.
      "icon-sm": "size-control-sm shrink-0 p-0",
      // CONTENT-SIZED: the child IS the control (a portrait/media trigger). Every other size pins a
      // control height, so a display-token child larger than it (`size-avatar-hero`, 64px) paints OUTSIDE
      // its own button and the real hit target stays the 34px control box — the stickler 2026-08-01 F2
      // defect. A `className` did not fix that from a feature: `size-*` on custom tokens was opaque to
      // tailwind-merge, so the variant's `size-control-md` survived the override and won on cascade order.
      // Post-#146 the override would win instead — which makes this arm MORE necessary, not less: the fix
      // for "my button is the wrong box" is a named size, never a call-site class that silently defeats the
      // seal (`ui-size-via-variant` reds it). The child owns the touch floor here (an avatar-hero portrait
      // clears it by 20px).
      media: "size-auto p-0",
      // MULTILINE: the `sm` step's WRAPPING twin — a choice/option affordance carrying a model-authored
      // sentence, so the label wraps (`whitespace-normal` over the base's nowrap) and the height FOLLOWS
      // the wrapped text, floored at the `sm` control height (D62: ≥ the pointer's tap floor at both
      // pointer classes — `--spacing-control-sm` is 44px coarse / 32px fine, ≥ `--spacing-touch-target`).
      // A call-site `h-auto` did not express this: a custom-token height (`h-control-sm`) was opaque to
      // tailwind-merge, so both heights survived the merge and stylesheet order picked the winner (post-#146
      // it resolves last-wins, i.e. the call site silently beats the seal) — the `media` (F2) and TabsTab
      // `layout="stacked"` precedent. The arm is where the wrapping box is NAMED. Pinned by COMPUTED height in
      // tests/ui/primitives/button/button.ct.tsx.
      wrap: "h-auto min-h-control-sm whitespace-normal px-block py-field text-label leading-label",
      // INLINE: the DISPLAY-AT-REST arm — a datum/line of prose that is also the click target (a tracker
      // value, a beat line, a card row, a roster name). It wears NO control box: text-height, start-aligned,
      // regular weight, so it reads as the text it stands in for and the click-to-edit swap is pixel-stable.
      // It was 13 call sites of `!h-auto min-h-0 !py-0 font-normal` — an `!important` escape from the sealed
      // control height, which is also how they escaped the `ui-size-via-variant` gate (it reads `h-auto`,
      // not `!h-auto`). MEASURED, not assumed (twMerge 3.6, PRE-#146): custom-token spacing/height utilities
      // were unclassifiable — `twMerge("h-control-sm","h-auto")` kept BOTH, so those call sites resolved by
      // stylesheet order, i.e. luck (the `media`/`wrap`/TabsTab-`stacked` precedent). #146 registered the
      // spacing scale; that pair now resolves last-wins, and the `!` on the surviving escapes is inert.
      // The arm still sets NO padding at all: preflight already zeroes it, and the call site is the only
      // place that knows what the datum sits in.
      // Padding is the call site's — px-field/py-row/none — and needs no `!` because nothing fights it.
      // TOUCH FLOOR BY CONSTRUCTION: a text-height button is ~18px tall, so the arm carries its own hit-area
      // pseudo (the TOUCH_TARGET_PSEUDO idea on `::before`, stretched to the button's own width rather than
      // square) sized on `--spacing-touch-target` — the POINTER-CONDITIONAL token: ≥44px on coarse/unknown
      // pointers, 28px on fine. Layout-neutral (absolutely positioned), so the datum's box is unchanged.
      // It is `::before` for the #1843 reason spelled out on `glyphBox` above: the CTA ring owns `::after`
      // unlayered, so an `inline` PRIMARY button's hit area was being replaced by a ring that cannot be
      // clicked. Pinned by COMPUTED box in tests/ui/primitives/button/button.ct.tsx.
      inline: [
        "relative h-auto min-h-0 justify-start font-normal text-label leading-label",
        "before:absolute before:top-1/2 before:left-1/2 before:h-touch-target before:w-full before:min-w-touch-target",
        "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
      ],
      // GLYPH: the SQUARE ICON-ONLY MICRO-BUTTON ramp — the `icon` size's sub-control twin. `icon` is a full
      // `control-md` box (a toolbar button that happens to hold a glyph); a glyph button rides INSIDE a dense
      // row — a badge's dismiss, a list row's trailing delete, an editor row's toggle strip — where a control
      // height would be taller than the thing it hangs off. It was 13 call sites of
      // `<Button intent="ghost" size="sm" className="!size-N !p-0">` at four scales, i.e. an `!important`
      // escape from the sealed `sm` control height, which is also how they escaped the `ui-size-via-variant`
      // gate for a day (it read `size-6`, not `!size-6`). A className CANNOT express this: `size-control-sm`
      // was a custom token, opaque to tailwind-merge (`twMerge("size-control-sm","size-6")` kept BOTH), so
      // those sites resolved by stylesheet order — with `!important` bolted on to force the coin flip (#146
      // registered the scale, so that pair now resolves last-wins and the `!` is inert). The
      // `media` / `wrap` / `inline` precedent.
      //
      // The box is a POINTER-INDEPENDENT display size (`--spacing-glyph-*`, the avatar/checkbox/slider-thumb
      // family): it never narrows, because it is already below every control step. Which means it is below the
      // tap floor at three of its four steps, so EVERY arm carries the `inline` arm's hit-area pseudo — a
      // square `size-touch-target` ::before, centered and absolutely positioned, so the visible glyph box is
      // unchanged while the real hit target is the pointer-conditional touch token. Before this arm those 13
      // sites had NO hit area at all beyond their 16–24px box.
      //
      // Four steps, not one: the sweep is geometry-PRESERVING (`done ≠ rendered` — resizing 13 live controls
      // is a design change, not a gate fix), and the four scales are four real roles the token descriptions
      // name. Pinned SITE-BY-SITE against the retired `!size-N` strings by COMPUTED box in
      // tests/ui/primitives/button/button.ct.tsx.
      "glyph-xs": glyphBox("size-glyph-xs"),
      "glyph-sm": glyphBox("size-glyph-sm"),
      "glyph-md": glyphBox("size-glyph-md"),
      "glyph-lg": glyphBox("size-glyph-lg"),
      // THE WRAPPING-RAIL CELL — one home with Toggle's identical arm (`CHIP_BOX`, lib/control-size.ts),
      // because a scope toggle and a tag button sit in the SAME rail and two boxes there is the defect,
      // not the feature. Pair it with `shape="pill"` + `intent="outline"`.
      chip: CHIP_BOX,
    },
    // THE RADIUS AXIS (added 2026-08-16, program #102). It used to live in `base` as a bare
    // `rounded-control`, which made a pill button UNSPELLABLE from a call site: `rounded-control` is a
    // custom `--radius-*` token, so tailwind-merge cannot classify it and `cn("rounded-control",
    // "rounded-full")` keeps BOTH — the winner decided by stylesheet order, i.e. luck (the same
    // unclassifiable-custom-token trap the `media`/`wrap`/`inline` size arms document). Moving it onto a
    // variant makes the choice a declaration instead of a coin flip; the default is byte-identical to
    // what `base` emitted.
    shape: {
      /** The standard control box — every button that is a button. */
      control: "rounded-control",
      /** A PILL — a destination/filter chip in a wrapping rail, where the full radius is what says "this
       *  is one of many small things to skim" rather than "this is a control to operate". */
      pill: "rounded-full",
    },
    // THE SELECTION STATE LAYER (added 2026-08-17, program #102 variant B). Toggle already owns this
    // reading on `data-pressed` — but a TRI-STATE filter (off → include → exclude → off) cannot be a
    // Toggle: `aria-pressed` has two values and a third state announced through it would be a lie. So the
    // one control class that needs the reading most had no route to it, and the two live sites spelled it
    // as call-site classNames (`inset-ring-2 inset-ring-ring` / `… inset-ring-destructive line-through`) —
    // a skin decided in a feature, which is how two rails drift.
    //
    // DECLARED AFTER `intent` ON PURPOSE (the Badge `tone` precedent): tv() emits variant classes in key
    // order, so these must come last for tailwind-merge to resolve `bg-*`/`border-*`/`text-*` in the
    // state's favour over the resting intent's.
    //
    // The fill is `accent` + a 2px `inset-ring-*` — byte-identical to Toggle's `data-pressed` skin, which
    // is what makes a selected scope toggle and a selected tag chip in the same rail ONE reading. The
    // ring layer is `--tw-inset-ring-shadow`, distinct from FOCUS_RING's `--tw-ring-shadow`, so a focused
    // selected chip still stacks its focus ring on top.
    //
    // …AND THAT STACK NEEDED A SECOND HUE (side-eye 2026-08-17 taste (c), se-chars-focusring-crop.png).
    // Both layers painted the `ring` token, so a FOCUSED selected chip and a merely selected chip were the
    // same picture — two ember rings — and keyboard position became unreadable exactly where a tri-state
    // control makes it matter most. Both selected arms therefore compose FOCUS_RING_ON_SELECTED, which
    // re-hues the FOCUS ring only; the selection ring keeps its Toggle parity. The fragment is HOMED in
    // lib/focus-ring.ts (never hand-spelled here — `ui-skin-fragment-purity`), and the override lands in
    // the variant rather than at a call site because a skin decided in a feature is how two rails drift.
    selection: {
      /** Not selected — the resting `intent` skin stands alone, focus ring included. */
      none: "",
      /** IN the set. */
      on: `border-transparent bg-accent text-accent-foreground inset-ring-2 inset-ring-ring ${FOCUS_RING_ON_SELECTED}`,
      /** SUBTRACTED from the set — the exclusion arm of a tri-state facet. It carries BOTH a hue and a
       *  strike because the state must never rest on colour alone (a red ring and an ember ring are one
       *  ring to a red-blind reader); the strike says "not this one" on its own. */
      negated: `border-transparent bg-accent text-accent-foreground inset-ring-2 inset-ring-destructive line-through ${FOCUS_RING_ON_SELECTED}`,
    },
  },
  defaultVariants: { intent: "primary", size: "md", shape: "control", selection: "none" },
});
