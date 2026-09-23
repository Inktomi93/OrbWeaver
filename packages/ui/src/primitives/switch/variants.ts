import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, TOUCH_TARGET_PSEUDO, tv } from "#lib";

// FOUR DIMENSIONS, THREE TOKENS AND ONE DERIVED KNOB, ALL POINTER-CONDITIONAL (#1109, owner ruling
// 2026-09-02; the knob became derived at #1684, owner ruling 2026-09-06 — the paragraph below the #424
// one states why). The track's WIDTH is `--spacing-switch-track` (64 coarse / 48 fine), its HEIGHT is
// `--spacing-switch-track-height` (44 / 32), the gap between track and knob is `--spacing-switch-inset`
// (9 / 6), and the knob is what is LEFT — `track-height − 2×border − 2×inset` (24 / 18 at the 16px root,
// ~55% of the height at each pointer, byte-identical to the values #1109 shipped as a token).
// Until #1109 there were only TWO tokens, because `--spacing-switch-thumb` was doing two jobs: the
// fine-pointer TRACK HEIGHT (`h-switch-thumb` on the root, with `pointer-coarse:h-touch-target` bolted on
// for the coarse arm) AND the thumb size at every pointer. A token cannot be both, so the knob could not
// scale with the pointer: at fine it was 100% of the track height — flush with the root's OUTER box top
// and bottom, a slab in a slot rather than a knob in a track — and at coarse the same 32px sat in a 64x44
// field. The root now spells its height from ONE token whose own @media(pointer:fine) override carries the
// arm, so the unknown-pointer case (which used to get the coarse WIDTH and the fine HEIGHT) is coherent
// 64x44 too. `TOUCH_TARGET_PSEUDO` stays as the unknown-pointer HIT fallback; the ≥44px coarse floor on
// the VISIBLE box is pinned in tests/ui/touch-target-floor.suite.ct.tsx.
//
// #420's CRESCENT RULING SURVIVES — ITS INPUT CHANGED. That ruling read a 48x44 root as "a 1.091-aspect
// near-circle with track painting on all four sides of the knob … a crescent moon, not a switch", and the
// fix was to widen the coarse track. #1109 deliberately reintroduces track on all four sides of the knob,
// which is the surface form #420 named. The MEASURED quantity #420 actually moved is the ASPECT, and that
// floor is untouched and still pinned at both pointers (>1.4; 1.5 fine, 1.455 coarse): a four-sided track
// gap at 1.09 aspect is a crescent, and at 1.5 aspect it is what every switch on earth looks like. What
// #420 could not distinguish, because the thumb was welded to the track height, is now two independent
// dials. Recorded, not silently reversed — the aspect pin is the enforcer, the prose is not.
//
// THE BORDER IS ARITHMETIC, NOT JUST PAINT (#424, closing side-eye #420 P3) — ALSO SURVIVING A CHANGED
// INPUT. The root is `border-box`, so its CONTENT box is 2× the border narrower than the track width, and
// a travel of `track − thumb` parked the checked thumb one border-width PAST the right rim (measured
// insetRight −1 at both pointers). #424 subtracted the border twice. The knob is now inset EQUALLY on all
// four sides instead: the root spends `--spacing-switch-inset` as INLINE padding — `px-switch-inset`,
// 9px coarse / 6px fine — and the BLOCK inset is the same quantity because the knob's own height is what
// the inset leaves (the #1684 paragraph below). That token is a LITERAL, not a calc
// (the `--spacing-slider-inset` precedent: DTCG $values carry no references), and the first spelling here
// WAS the calc — `no-raw-spacing-in-features` refused it, correctly: this repo spells spacing as intent
// tokens. The CT asserts the RENDERED inline gap EQUALS the RENDERED block gap at both pointers, so an
// unmirrored retune of any of the other tokens goes red on geometry instead of drifting. Substitute the
// inset into `trackW − 2×border − 2×inset − thumb` and both the border and the thumb cancel:
//
//     travel = trackWidth − trackHeight        (20px coarse, 16px fine)
//
// which is what the translate calc spells. The border has NOT stopped being subtracted — it is subtracted
// twice inside the inset, once at each end — so #424's defect cannot return; do not "simplify" the
// padding away on the grounds that the travel no longer names the border. Pinned as a RELATION against the
// rendered boxes at both pointers in tests/ui/primitives/switch/switch.ct.tsx. The root's border COLOUR is
// untouched: `border-border` and the `data-invalid:` / `data-checked:` colour variants ride the colour
// axis, which the width spelling never names.
//
// THE KNOB IS DERIVED, NOT DECLARED (#1684, owner ruling 2026-09-06) — AND THAT RETIRES ONE HALF OF §2's
// DECLARED RESIDUAL. `--spacing-switch-thumb` was a fourth belted token, so the knob, the track height and
// the border were three INDEPENDENTLY rounded integers and `items-center` halved whatever
// `(track-height − 2×border − thumb)` happened to be. Even at scale 1 by authorship; ODD wherever the belt
// rounds them apart. At `--font-scale` 1.25 — the `reading` appearance preset, i.e. a shipping user state —
// the fine arm resolved track-height 40, thumb round(up, 1.125rem × 1.25 = 22.5) = 23, border 1, so the
// content box was 38 and the knob RESTED at 1 + (38−23)/2 = 8.5px: half a device pixel at DPR 1, which is
// what design-audit's `off-grid-transform` filed as #1684 against `span[data-slot=switch-thumb]` on
// settings:appearance. `docs/law/integer-line-boxes.md` §2 (the #1640 amendment) had DECLARED that
// residual unreachable — "no authored value and no round() on a token can reach" the difference of two
// belted lengths — and for a DECLARED thumb that is exactly right. It is reachable by making the knob a
// FUNCTION of the other three: `h-[calc(track-height − 2×border − 2×inset)]`, so the centred difference is
// `2×inset` by construction and the rest landing is exactly `border + inset` — whole at EVERY font scale
// (fine: 1@1 → 7 · 0.875 → 7 · 1.15 → 8 · 1.25 → 9). The ruling survives; its INPUT changed. Consequences,
// deliberately: the token is RETIRED from the vault (its #1109 ~55% ruling now lives on
// `--spacing-switch-inset`, the primary of the pair); the knob is 24/18 at the 16px root exactly as #1109
// shipped, and 14 at 0.875 / 22 at 1.25 rather than 16 / 23, all inside the CT's 0.45–0.65 share pins; the
// travel identity above is UNCHANGED and now exact at every scale rather than at scale 1; and the calc is
// token-driven, which is why `no-arbitrary-tw-values` (TOKEN_DRIVEN_RE) and `no-raw-spacing-in-features`
// (no `h-` arm) both pass a spelling their `px-[calc(…)]` cousin was correctly refused for. NOT fixed here
// and not this control's to fix: the element's ABSOLUTE landing, which is its ancestors' — #1684's 0.484
// device px is this 0.5 plus ~0.984 inherited from the settings row stack.
//
// THE RESIDUAL THIS HEADER USED TO RECORD IS CLOSED. It read: "the thumb is exactly as tall as the root at
// a fine pointer … inset-ing it vertically would mean shrinking the display thumb, a size decision this fix
// has no mandate for." #1109 IS that mandate. Closing it also closed #1170, which was the same geometry
// seen through an instrument: a knob with no track above or below it has no track in the BAND a fill probe
// samples, so `snap --contrast '[data-slot=switch-thumb]'` on settings:chat-behavior resolved the ON knob
// (`--color-primary-foreground`, 31,16,7) against a band that was 72% PAGE (`--color-background`, 15,12,10)
// and printed FILL 1.05:1 FAIL for a knob measuring ~7:1 against the ember track it actually sits on. The
// instrument was right and the geometry was the defect; the surround clause is pinned from the framebuffer
// in switch.ct.tsx, in both states and all three seeds.
//
// THE QUIET STATE IS THE QUIET ONE — the OFF THUMB's ink, not its geometry (#1090; side-eye F10/E3
// 2026-08-30, re-measured 2026-09-02 and machine-detected by `design-audit`'s `quiet-state` P2 in every
// appearance/theme/pane arm: "OFF 12.58:1 vs ON 7.06:1"). The thumb was `bg-foreground` — the page's
// brightest ink, opaque, 32 of the track's 48px (the knob's SIZE then; #1109 has since made it 18) —
// while the track is a 12% overlay compositing to
// 1.41:1. So the OFF switch's loudest object measured 11.118:1 (CT framebuffer, Hearth over `bg-card`)
// against a 7.056:1 ON state: the surface spent its loudest register on the state that carries NO
// information — six near-white pills that mean "off". NOT snap's number AS IT STOOD THEN: `snap
// --contrast` on `[data-slot=switch-thumb]` read the element's INK (`getComputedStyle().color`), which on
// the thumb is the inherited `--color-foreground` and paints nothing — it read 16.26:1 both before and
// after this change, and only matched the fill before because the fill was that same token. TRUTH-REPAIR
// 2026-09-02: that caveat expired when #1111 gave `--contrast` a FILL arm for fill-only subjects, which
// is exactly the instrument that then filed #1170 against this control. Snap's number on this selector is
// now the knob's painted fill against its band, and it is quotable.
//
// `muted-foreground/80` is the value BOUNDED FROM BOTH SIDES, which is what makes it a measurement
// rather than a taste. CEILING: it must sit under the ON state's loudest member on every seed and both
// pane hosts — including the `quiet` tone, whose deliberately dim checked track has only 3.69:1 to
// spend under Light. FLOOR: WCAG 1.4.11 asks 3:1 of the visual information that identifies a control's
// state, and the OFF knob IS that information. The alpha rides over the TRACK, so the knob composites
// polarity-correctly on a light theme instead of needing a second hand-picked value. Measured
// (theme/pane → OFF loudest, ON accent, ON quiet, and the read-only lock glyph against the thumb):
//   Hearth/bg   4.563 (was 12.701) · 7.437 · 5.610 · 6.157   Hearth/card 4.137 (was 11.235) · 7.056 · 5.967 · 6.311
//   Mocha /bg   4.415 (was 12.351) · 7.375 · 5.562 · 6.070   Mocha /card 3.824 (was 10.425) · 7.285 · 6.008 · 6.229
//   Light /bg   3.560 (was 11.153) · 6.193 · 3.693 · 4.968   Light /card 3.651 (was 11.606) · 6.292 · 3.750 · 4.895
// Both bounds are pinned from the FRAMEBUFFER in tests/ui/primitives/switch/switch.ct.tsx, in all three
// seeds — computed style can see neither the compositing nor the oklch, and a polarity fix proven on
// the dark arm alone is this tree's recorded failure family.
//
// The thumb's SIZE was the one item #1090 deferred out of E3's ask ("~55% of track height") as its own
// row; that row is #1109 above, and the measured ratios in the table are UNCHANGED by it — the knob's
// colour tokens did not move, only its box. NOT changed here, still deliberately: the ON skin (the accent
// track IS the ON signal and already carries it), and the `quiet` tone's `foreground/55` checked track
// (raising it was the other way to fix quiet's Light arm; unnecessary once the OFF knob is bounded, so
// the /70 rejection recorded below survives intact).
//
// `tone` rations the accent (north-star §5 rule 0.5, PP1's Badge `tone` precedent; owner-sanctioned
// 2026-07-16): `accent` (default) is the byte-identical ember-on-checked skin — the ONE sanctioned
// accent toggle per surface. `quiet` swaps the CHECKED track onto the derived neutral ramp
// (`--color-secondary`, a theme-retinted opaque grey — never a raw value), so a rack of per-row
// switches never multiplies the accent regardless of what color a theme resolves `--color-primary` to.
// The on/off signal is NEVER color-alone: the thumb TRAVEL (data-checked translate, untouched) plus the
// shared unchecked `bg-input` track hold a11y state distinctness across BOTH tones without ember.
export const switchVariants = tv({
  slots: {
    root: [
      "relative inline-flex h-switch-track-height w-switch-track shrink-0 cursor-pointer items-center justify-start rounded-full border-(length:--border-width-control) border-input-border bg-input py-0 px-switch-inset",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE,
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive",
      FOCUS_RING_DESTRUCTIVE,
      TOUCH_TARGET_PSEUDO,
    ],
    thumb: [
      "group relative flex aspect-square h-[calc(var(--spacing-switch-track-height)_-_2_*_var(--border-width-control)_-_2_*_var(--spacing-switch-inset))] items-center justify-center rounded-full bg-muted-foreground/80",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-switch-track)_-_var(--spacing-switch-track-height))]",
    ],
    // Hidden by default, shown only via data-readonly. Color inverts against whichever thumb bg is live.
    readOnlyIcon: "hidden text-background group-data-[readonly]:block",
  },
  variants: {
    tone: {
      accent: {
        root: "data-checked:border-primary data-checked:bg-primary",
        thumb: "data-checked:bg-primary-foreground",
        readOnlyIcon: "group-data-[checked]:text-primary",
      },
      // MEASURED, not chosen by taste (side-eye F-08, 2026-08-02): the checked track was `--color-secondary`
      // (L 0.255) while the UNCHECKED `bg-input` (12% white over the card) composites to ≈L 0.286 — ON was
      // DARKER than OFF, so a rack of twelve rows signalled its state with a 10px thumb offset and nothing
      // else (the switch CT's separation pin measures 0.017 on that pair, ~0 for the eye).
      //
      // `foreground/55` is the RENDERED call the review left open ("bg-foreground/70 … your call from the
      // rendered result"): /70 painted six near-WHITE pills that out-shouted the row names they belong to —
      // loudness traded, not fixed — while /55 still measures a ~0.4 separation, far past the pin's 0.15
      // floor. It spends no accent either way, which is this tone's whole reason to exist; the thumb
      // inverts to `background` so it stays visible against the now-bright track (the `accent` arm's own
      // thumb-inversion pattern).
      quiet: {
        root: "data-checked:border-foreground/55 data-checked:bg-foreground/55",
        thumb: "data-checked:bg-background",
        readOnlyIcon: "group-data-[checked]:text-foreground",
      },
    },
  },
  defaultVariants: { tone: "accent" },
});
