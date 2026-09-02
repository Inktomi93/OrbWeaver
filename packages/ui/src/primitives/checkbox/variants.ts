import { SELECTION_CONTROL, tv } from "#lib";

// The checkbox skin — bg-input/border-border at rest; checked and indeterminate flip to the tone's own
// checked fill with a glyph. SELECTION_CONTROL supplies the shared frame + state machine (focus ring,
// disabled, read-only cursor, invalid border/ring, and the ::before touch-target hit area); the
// checkbox layers its rounding, glyph text color, and the checked/indeterminate fill.
//
// `tone` RATIONS THE ACCENT — THE SWITCH'S OWN AXIS, ONE SELECTION CONTROL OVER (#1110, owner ruling
// 2026-09-02). `accent` (default) is the byte-identical ember-on-checked skin and stays the polarity
// #1090 ruled: the ON state carries the accent. `quiet` is the BULK-DEFAULT arm — for a group whose
// default is ALL-SELECTED, where the accent would be spent eleven times on the unremarkable default.
// Backup & Restore's "Include" fieldset is that group and the only caller: eleven checked boxes, all
// checked before the user has decided anything, were the loudest ink in the pane.
//
// THE POLARITY IS NOT REVERSED, AND `quiet-state` MUST KEEP NOT FIRING. The ON state still carries its
// own ink — the opaque `--color-selection-quiet` fill plus the check glyph — it just carries no ember.
// Ranked the way the rule ranks it (each state's own fill against the pane it sits on, `ui-audit` census-region.ts; it files
// a P2 only when OFF outruns ON by more than its 1.5 inversion tolerance). ON is LOUDER than OFF on every
// seed, so there is no inversion, and QUIETER than the accent on every seed, which is the whole point.
//
// `foreground/55` WAS THE FIRST CUT AND IT DID NOT SURVIVE ITS OWN GATE. Reusing the switch's already
// bounded alpha made the two quiet arms one decision, but it forced the mark to `text-background` — an
// INVERTED pair ink, whose ground is the control's own fill and not a surface — and `seed-theme-ink-
// contrast` judges every non-`-foreground` ink against the eight enumerated surface GROUNDS, where
// `background` on `--color-background` is 1:1 by construction. 48 findings, unpassable by tuning. The
// switch's identical `readOnlyIcon` construction rides that gate's exemption table; this lane was ruled
// to fix the class instead, and the fix is strictly better: `--color-selection-quiet` is OPAQUE, so the
// pair is one measurable fact rather than an alpha composite that changes with whatever is behind it
// (`alpha-token-needs-composited-contrast-probe`), and the `-foreground` suffix makes the inversion a
// pair the census can SEE (lib/seed-theme-ink.ts `inkTokensIn`) instead of one it must be told about.
//
// The pair is BOUNDED FROM BOTH SIDES and both bounds are machine-checked — tokens.json carries the
// derivation, palette-contrast.suite.test.ts pins the pair per seed, and checkbox.ct.tsx pins it from the
// FRAMEBUFFER (computed style can see neither the composite nor the oklch). Over `bg-card`:
//                quiet box vs pane   check glyph vs box   the accent it must undercut
//   Hearth            5.759                6.145                    6.836
//   Light             4.994                4.781                    6.264   ← the binding arm
//   Mocha             5.687                6.145                    6.658
// The glyph clears AA-NORMAL 4.5:1 on every seed, which is the TEXT bar — a checkmark would only owe
// 1.4.11's 3:1, and the margin is deliberate. The fill's worst ground is the `bg-accent` an interactive
// row paints on hover: 4.618 / 4.119 / 4.528, all above 1.4.11's 3:1.
//
// THE GLYPH INK RIDES THE CHECKED STATE, not the root. The root's `text-primary-foreground` is what the
// read-only Lock glyph inherits in the UNCHECKED state, and it is unchanged on both tones — a tone must
// not repaint a state it has no opinion about.
export const checkboxVariants = tv({
  slots: {
    root: [SELECTION_CONTROL, "rounded-control text-primary-foreground"],
    indicator: "group flex items-center justify-center",
    check: "hidden text-current group-data-[checked]:block group-data-[readonly]:hidden",
    dash: "hidden text-current group-data-[indeterminate]:block group-data-[readonly]:hidden",
    // The read-only signal: hidden by default, shown only when Base UI sets data-readonly on
    // the indicator — takes precedence over check/dash so read-only reads as ONE consistent mark
    // regardless of checked state (mirrors Switch's thumb-Lock treatment).
    readOnlyIcon: "hidden text-current group-data-[readonly]:block",
  },
  variants: {
    tone: {
      accent: {
        root: "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
      },
      quiet: {
        root: [
          "data-checked:border-selection-quiet data-checked:bg-selection-quiet data-checked:text-selection-quiet-foreground",
          "data-indeterminate:border-selection-quiet data-indeterminate:bg-selection-quiet data-indeterminate:text-selection-quiet-foreground",
        ],
      },
    },
  },
  defaultVariants: { tone: "accent" },
});
