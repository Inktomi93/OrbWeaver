// The message row's LEGIBILITY BACKINGS — one seam, three constants, split out of message-row-variants.ts
// to keep it under the 450-line component-size cap (UI-Architecture §2.1).
//
// The first two are the background-PHOTO backings (the side-eye P1 + its follow-up, extended by #106):
// both are self-gated by Tailwind's `in-*` ANCESTOR variant on `data-has-bg-image` (the shell grid stamps
// it, shell.css) — the declarative way to react to a shell-level flag with NO render-time DOM read — so
// they are INERT without a bg image (a plain background is byte-identical to pre-fix).
//
// The third (`STICKY_ATTRIBUTION_CHROME`, #113) is NOT wallpaper-gated, because what it backs the chrome
// against is the row's own scrolling prose rather than a photo. Read its own note before merging it with
// the other two — they answer different questions and share only a visual recipe.
//
// All three are static (no transition) ⇒ reduced-motion-safe.

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
// as its own rounded CHIP (`rounded-card` + a little padding).
//
// WHERE IT IS APPLIED, and the 2026-08-16 correction (#106). The NAME row still takes it via
// `RowSkin.chromeBacking`, no-fill modes only — that half of the 2026-07-09 ruling stands. What did NOT
// stand is the sentence this comment used to end with: the filled modes' chrome "passed the side-eye's
// live measurement ... flagged for the coordinator either way". That pass was CIRCUMSTANTIAL — it was
// measured under the owner's dark wallpaper. Re-measured against the worst LEGAL background (a pure-white
// wallpaper at `backgroundDim` 0 — BACKGROUND_DIM_MIN = 0, packages/contracts/src/settings/index.ts), the
// chrome BELOW the bubble renders pale grey on white in EVERY mode, because nothing anchors it: the
// metadata row and the message-footer disclosures sit under the bubble box, outside any fill, on the raw
// photo. So message-row.tsx now applies this same scrim to those two, mode-independently. Extending the
// existing mechanism is the ruled fix (#106); an adaptive sampled-luminance scrim was DECLINED.
//
// Self-gated on `in-data-[has-bg-image]` like its sibling, so a plain-background theme is byte-identical.
export const BG_PHOTO_CHROME_SCRIM =
  "in-data-[has-bg-image]:bg-scrim in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row";

// STICKY SPEAKER ATTRIBUTION (#113) — a DIFFERENT backing from the two above, deliberately not merged
// with them. Those two answer "the chrome is floating on a wallpaper at rest" and are wallpaper-gated.
// This one answers "the chrome is now floating over the row's OWN prose", which is true regardless of
// theme: inside a turn taller than the screen the name row is pinned to the top of the scrollport and the
// body scrolls underneath it, so it needs an opaque-enough chip in EVERY mode, wallpaper or not.
//
// Applied only to rows the virtualizer MEASURED as exceeding the scrollport (`MessageListRowMeta`), so a
// normal-length message is byte-identical to before — no chip, no sticky, no new stacking context.
// Static (no transition) ⇒ reduced-motion-safe.
//
// IT IS LAYOUT-NEUTRAL BY CONSTRUCTION, and that is not decoration. The sticky verdict arrives AFTER the
// virtualizer measures the row, so any height the chip added would land as a post-paint reflow — a real
// CLS event on exactly the tall rows this is meant to help. `py-row` is therefore cancelled by `-my-row`:
// the chip is visually taller than the text, occupies the same vertical extent, and the measured row
// height does not move. There is deliberately NO horizontal padding: the name row already spans the
// content column, and an `-mx-*` would push the chip past the 75ch reading measure (globals.css).
export const STICKY_ATTRIBUTION_CHROME = "-my-row sticky top-0 z-raised rounded-card bg-scrim py-row backdrop-blur-sm";
