// The overlay backdrop scrim recipe — the theme-aware `bg-scrim` token (D43 §11.4; never
// `bg-black/50`) pinned full-bleed. Homing the token here keeps a per-seal `bg-scrim` re-spelling
// (and a drift in the z/fade pairing) impossible.
//
// SCRIM(tier) is the COMPLETE backdrop for the standard overlays — two tiers: `popover` (menu/
// popover/select modal backdrops, the fast fade) and `modal` (dialog/alert-dialog, the base fade).
// Consumers needing MORE (dialog's `backdrop-blur-sm`) compose it alongside.
//
// SCRIM_BASE is the bare full-bleed fill (no z, no motion) — the drawer backdrops compose it with
// their OWN z + `--motion-layout` fade because they track the sliding panel, a different motion
// contract from the standard overlay fade.
import { OVERLAY_MOTION } from "./overlay-motion.ts";

export const SCRIM_BASE = "fixed inset-0 bg-scrim";

export const SCRIM = (tier: "popover" | "modal"): string => `${SCRIM_BASE} z-(--z-${tier}) ${OVERLAY_MOTION.backdropFade(tier === "modal" ? "base" : "fast")}`;
