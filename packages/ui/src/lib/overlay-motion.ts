// The overlay-motion class fragments (§13.0 litmus, C6 rollup) — the anchored-popup fade+scale is
// byte-identical across 6 float seals (select/menu/popover/tooltip/autocomplete/combobox), the modal
// fade+scale across 2 (dialog/alert-dialog), and the scrim fade across 5. One copy DRIFTED:
// `select/variants.ts`'s backdrop carried no transition classes at all, so its scrim hard-cut while
// every sibling scrim fades. Composing from here makes that drift class structurally impossible.
//
// `anchoredPopup` rides Base UI Positioner's `--transform-origin` var (the popup scales from the
// trigger edge, not center) at `--motion-fast`. `modalPopup` is the same fade+scale but at
// `--motion-base` (modals settle slower than anchored floats) with no `origin-(--transform-origin)` —
// modals are centered/edge-docked, not anchor-scaled. `backdropFade(duration)` is the scrim opacity
// fade; duration is a param because anchored floats fade their scrim at `fast` and modals at `base`.
export const OVERLAY_MOTION = {
  anchoredPopup:
    "origin-(--transform-origin) transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  modalPopup:
    "transition-all duration-(--motion-base) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  backdropFade: (duration: "fast" | "base"): string =>
    `transition-opacity duration-(--motion-${duration}) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0`,
} as const;
