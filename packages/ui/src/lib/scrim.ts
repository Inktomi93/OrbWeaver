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

// THE iOS ARM IS BASE UI'S OWN, AND IT IS NOT OPTIONAL (#1868). Their vendored docs put `min-height:
// 100dvh` plus `@supports (-webkit-touch-callout: none) { position: absolute }` on EVERY backdrop —
// Dialog (8 occurrences), AlertDialog (4), Drawer (4), Combobox (1) — under the comment "iOS 26+: Ensure
// the backdrop covers the entire visible viewport." A `position: fixed` backdrop is laid against the
// LAYOUT viewport, and on iOS 26 that can be shorter than what the reader is actually looking at once
// browser chrome collapses, leaving an undimmed strip at the edge of every overlay. `absolute` beds it in
// the document instead, and `min-h-dvh` is what makes that box tall enough to be worth bedding.
//
// `-webkit-touch-callout` IS THE UA TEST, not a capability we care about: it is a WebKit-only property, so
// the @supports query is the house way to ask "is this WebKit" without sniffing a user agent. Base UI
// chose it; we match it rather than inventing a second discriminator for the same question.
//
// ONE STRING, SIX OVERLAYS. `SCRIM_BASE` feeds `SCRIM(tier)` which feeds dialog, alert-dialog, drawer,
// menu, popover and select — so the arm lands on all of them here or on none of them anywhere.
//
// IT CANNOT BE PINNED BY A RENDERED TEST, and that is a property of the subject, not an omission: the
// `absolute` arm is reachable only in WebKit, and every browser we drive (CT, snap, design-audit) is
// Chromium, which resolves this @supports block to false and renders the byte-identical `fixed` box it
// always did. A CT asserting the computed position would pass while proving nothing. The honest pin is
// therefore STRUCTURAL and it now exists at `tests/ui/lib/scrim.test.ts` (#1871, landed 2026-09-19): the
// recipe's four fragments with the reason each is load-bearing, both SCRIM tiers embedding this base, and
// the REACH half — each of the six backdrop variants modules reaching SCRIM/SCRIM_BASE rather than
// re-spelling the fill, with a positive control so a moved module cannot empty the sweep into a false
// clean. Red-first receipts: deleting the supports arm reds the fragment test; replacing menu's
// `SCRIM("popover")` with a hand-rolled `fixed inset-0 bg-backdrop` reds the reach test. The earlier
// pointer here named `tests/ui/styles/css-structure.suite.test.ts`, whose subject is raw CSS TEXT in
// stylesheets; this is a TypeScript constant, so the mirror (AGENTS.md "Test layout") is the home.
export const SCRIM_BASE = "fixed inset-0 min-h-dvh bg-backdrop supports-[-webkit-touch-callout:none]:absolute";

export const SCRIM = (tier: "popover" | "modal"): string => `${SCRIM_BASE} z-(--z-${tier}) ${OVERLAY_MOTION.backdropFade(tier === "modal" ? "base" : "fast")}`;
