// The overlay backdrop scrim recipe — the theme-aware `bg-backdrop` token (D43 §11.4; never
// `bg-black/50`) pinned full-bleed. Homing the token here keeps a per-seal `bg-backdrop` re-spelling
// (and a drift in the z/fade pairing) impossible.
//
// `--color-backdrop` is the polarity-FIXED dimming smoke (it was `--color-scrim`, retired at #204: the
// old name also got reached for as an over-art TEXT backing, which needs the palette-following
// `--color-reading-plate` instead — a token names ONE polarity semantic). This recipe is for DIMMING
// what is behind an overlay, never for backing text over art.
//
// SCRIM(tier) is the COMPLETE backdrop for the standard overlays — two tiers: `popover` (menu/
// popover/select modal backdrops, the fast fade) and `modal` (dialog/alert-dialog, the base fade).
// Consumers needing MORE (dialog's `backdrop-blur-sm`) compose it alongside.
//
// SCRIM_BASE is the bare full-bleed fill (no z, no motion) — the drawer backdrops compose it with
// their OWN z + `--motion-layout` fade because they track the sliding panel, a different motion
// contract from the standard overlay fade.
import { OVERLAY_MOTION } from "./overlay-motion.ts";

export const SCRIM_BASE = "fixed inset-0 bg-backdrop";

export const SCRIM = (tier: "popover" | "modal"): string => `${SCRIM_BASE} z-(--z-${tier}) ${OVERLAY_MOTION.backdropFade(tier === "modal" ? "base" : "fast")}`;
