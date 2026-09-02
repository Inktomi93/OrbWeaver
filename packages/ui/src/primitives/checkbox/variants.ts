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
// own ink — a bright neutral fill plus the check glyph — it just carries no ember. Ranked the way the
// rule ranks it (each state's own fill against the pane it sits on, `ui-audit` census-region.ts; it files
// a P2 only when OFF outruns ON by more than its 1.5 inversion tolerance). ON is LOUDER than OFF on every
// seed, so there is no inversion, and QUIETER than the accent on every seed, which is the whole point.
//
// `foreground/55` IS THE SWITCH'S ALREADY-BOUNDED VALUE, NOT A SECOND HAND-PICKED ONE (switch/variants.ts
// header: /70 painted near-white pills that out-shouted the row labels; /55 keeps the separation). Reusing
// it makes the two selection controls' quiet arms one decision instead of two that drift. Its own floors
// hold here too — WCAG 1.4.11 asks 3:1 of the thing that identifies the control and of the mark inside it.
// MEASURED FROM THE FRAMEBUFFER over `bg-card` (computed style can see neither the alpha composite nor
// the oklch), quiet ON box vs pane · check glyph vs box · and the accent ON box it undercuts:
//   Hearth  5.475 · 5.967   (accent 6.824)
//   Light   3.750 · 3.590   (accent 6.267) ← the binding arm: the quiet fill has least to spend here
//   Mocha   5.352 · 5.936
// Pinned in tests/ui/primitives/checkbox/checkbox.ct.tsx, on ALL THREE seeds — a polarity fix proven on
// the dark arm alone is this tree's recorded failure family.
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
          "data-checked:border-foreground/55 data-checked:bg-foreground/55 data-checked:text-background",
          "data-indeterminate:border-foreground/55 data-indeterminate:bg-foreground/55 data-indeterminate:text-background",
        ],
      },
    },
  },
  defaultVariants: { tone: "accent" },
});
