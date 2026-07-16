// The background-PHOTO legibility backing for the no-fill chatStyle modes (flat/hush/document), split out
// of message-row-variants.ts to keep it under the 450-line component-size cap (UI-Architecture §2.1) —
// these two token-class constants + their WHY are a coherent seam (the side-eye P1 + its follow-up). Both
// are self-gated by Tailwind's `in-*` ANCESTOR variant on `data-has-bg-image` (the shell grid stamps it,
// shell.css) — the declarative way to react to a shell-level flag with NO render-time DOM read — so they
// are INERT without a bg image (a plain background is byte-identical to pre-fix). Static (no transition)
// ⇒ reduced-motion-safe.

// Reading backing (side-eye live P1, 2026-07-09): flat/hush/document carry NO bubble fill, AND the shell
// strips their float halo (they stamp `data-slot="message-bubble"`, which shell.css targets to kill the
// text-shadow "bubbles carry their own fill" — but these three don't), so their body text landed DIRECTLY
// on the photo → 2.0–2.4:1 on bright (sky) patches, the house §0 reading-surface #1 defect. Back the text
// with the theme `--color-scrim` + `backdrop-blur-sm` — the SAME legibility composition the Dialog seal
// uses (`bg-scrim backdrop-blur-sm`, dialog/variants.ts) — so light text clears AA over ANY region (scrim
// floors the luminance; blur collapses the bright peaks a flat scrim alone can't). Applied to `skin.inner`
// (the bubble) of the three no-fill modes; the filled modes' bubble/card/portrait fill already backs their
// text (side-eye: those SHIP as-is).
export const BG_PHOTO_READING_SCRIM = "in-data-[has-bg-image]:bg-scrim in-data-[has-bg-image]:backdrop-blur-sm";

// Chrome backing (name + action-icon row) — side-eye P1 follow-up (2026-07-09). That row is a SIBLING
// rendered ABOVE the bubble (message-row.tsx; verified: it sits entirely above the bubble box in EVERY
// mode, ~8px gap — never on the fill), so in the no-fill modes it floated on the raw photo → the
// interactive action icons hit 1.83:1 (fails WCAG 1.4.11's 3:1). Same scrim + blur as the reading surface,
// as its own rounded CHIP (`rounded-card` + a little padding). Applied via `RowSkin.chromeBacking` to the
// name-row — ONLY the no-fill modes carry it; the filled modes' chrome also floats structurally but passed
// the side-eye's live measurement (the opaque bubble below anchors it, plus the shell halo + the action-
// icon drop-shadow) — flagged for the coordinator either way.
export const BG_PHOTO_CHROME_SCRIM =
  "in-data-[has-bg-image]:bg-scrim in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row";
