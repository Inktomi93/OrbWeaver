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
// WHERE IT IS APPLIED, and the 2026-08-16 correction (#106). The chrome BELOW the bubble — the metadata
// row and the message-footer disclosures — takes it MODE-INDEPENDENTLY from message-row.tsx. The sentence
// this comment used to end with did NOT stand: the filled modes' chrome "passed the side-eye's live
// measurement ... flagged for the coordinator either way". That pass was CIRCUMSTANTIAL — it was measured
// under the owner's dark wallpaper. Re-measured against the worst LEGAL background (a pure-white wallpaper
// at `backgroundDim` 0 — BACKGROUND_DIM_MIN = 0, packages/contracts/src/settings/index.ts), that chrome
// renders pale grey on white in EVERY mode, because nothing anchors it: those bands sit under the bubble
// box, outside any fill, on the raw photo. Extending the existing mechanism is the ruled fix (#106); an
// adaptive sampled-luminance scrim was DECLINED.
//
// THE NAME ROW IS MODE-INDEPENDENT TOO NOW (#167, owner-observed live 2026-08-18) — and that REVERSES the
// surviving half of the 2026-07-09 ruling, which scoped the name row's chip to the no-fill modes through a
// `RowSkin.chromeBacking` field (deleted with this change; there is nothing left to vary per skin). The
// reversal is not a re-litigation, it is the SAME measurement #106 made, taken one band higher:
//   · The premise the 2026-07-09 scoping rested on is the one this file already states two paragraphs up —
//     the name row "sits entirely above the bubble box in EVERY mode, ~8px gap — never on the fill". A
//     mode's FILL therefore cannot back its name row, so "filled modes don't need the chip" was never a
//     statement about the filled modes; it was a statement about that particular wallpaper.
//   · The live receipt (owner's room "Example — The Rust Lecture", a bubble-family skin over art,
//     1920x1080): every name row read `background-color: rgba(0,0,0,0)`, `backdrop-filter: none`,
//     `z-index: auto` — assistant AND user — with the timestamp beside the speaker name measuring
//     1.63:1 (`snap --contrast --contrast-pixel [data-slot=message-metadata-timestamp]`, need 4.5).
//     The user row ("Traveler") has no fill anywhere near its chrome, which is why it read as the naked one.
//   · The transcript's readable floor is a GUARANTEE over ANY art in ANY skin, so the mechanism cannot be a
//     per-skin opt-in: one home (`nameRowFrame`, message-row-parts.tsx), all eight skins, both roles, both
//     themes. The CT that pinned the old scoping ("a FILLED mode (echo) does NOT chip its chrome") is
//     inverted in the same commit — half a migration is the rot.
//
// Self-gated on `in-data-[has-bg-image]` like its sibling, so a plain-background theme is byte-identical.
export const BG_PHOTO_CHROME_SCRIM =
  "in-data-[has-bg-image]:bg-scrim in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row";

// STICKY SPEAKER ATTRIBUTION (#113) — a DIFFERENT backing from the two above, deliberately not merged
// with them. Those two answer "the chrome is floating on a wallpaper at rest" and are wallpaper-gated.
// This one answers "the chrome is now floating over the row's OWN prose", which is true regardless of
// theme: inside a turn taller than the screen the name row is pinned to the top of the scrollport and the
// body scrolls underneath it, so it needs an OPAQUE chip in EVERY mode, wallpaper or not.
//
// THE FILL IS OPAQUE (`bg-card`), NOT THE SCRIM (#168, owner-observed live 2026-08-18: the band "lets some
// partial of the message you are on go above it"). It shipped as `bg-scrim backdrop-blur-sm` — and
// `--color-scrim` is `oklch(… / 0.6)`, a 60%-alpha overlay — so the prose running under the pinned band
// stayed VISIBLE THROUGH it, blurred and dimmed but legibly moving. That is the whole defect: a pinned band
// that does not own its slice. An occluding sticky header is the house recipe already (`modal-host.tsx`'s
// `sticky top-0 z-(--z-sticky) … bg-card`, `preset-editor-surface.tsx`'s `sticky top-0 z-(--z-raised)
// bg-card`), and an opaque fill makes `backdrop-blur` dead paint, so the blur went with the scrim.
//
// It also SUPERSEDES the wallpaper chip rather than stacking with it (`nameRowFrame`, message-row-parts.tsx):
// an opaque fill is a strict superset of a scrim one, and the two classes are the same property — stacking
// them let `in-data-[has-bg-image]:bg-scrim` win on specificity over art, which is exactly the mount the
// live receipt came from.
//
// THE MECHANISM THAT DID *NOT* HOLD (#167's own prediction, measured dead 2026-08-18): the note below used
// to end by naming a row-content sibling that mints its own stacking context as #168's cause. Hit-tested at
// four scroll depths on a settled row carrying prose + a code block + a table + a blockquote in a real
// 240px scrollport, `document.elementFromPoint` returned the BAND at every sampled point of its own box —
// nothing in the row's content out-paints it. The paint order stated below is correct and intact; what
// failed was opacity, not z-order. The hit-test survives as a fence in message-row.ct.tsx.
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
//
// THE CANCELLATION IS WALLPAPER-GATED (`not-in-data-[has-bg-image]:-my-row`, #167) because the padding it
// cancels is not always this constant's to cancel. Over a background image the name row ALREADY carries
// `BG_PHOTO_CHROME_SCRIM`'s `py-row`; both `py-row`s resolve to one padding, so an unconditional `-my-row`
// SHRANK the row by 2×--spacing-row the moment it went sticky — measured at 16px, i.e. the exact reflow
// this pair exists to prevent, on exactly the tall rows it exists to help. (That arithmetic was already
// wrong for flat/hush/document, whose chip predates this note; making the chip universal is what made it
// measurable.) Gate the compensation on the padding's owner instead: no wallpaper ⇒ this constant's own
// `py-row` is cancelled as before; wallpaper ⇒ the scrim's padding stands and nothing is cancelled, so
// going sticky changes NO box in either arm. Pinned by the "two backings STACK" CT.
// `z-(--z-raised)`, NOT `z-raised` (side-eye #102, 2026-08-17). `--z-raised` is a plain custom property in
// `theme.css`, not a `--z-index-*` theme namespace entry, so Tailwind generates NO `z-raised` utility for it
// — the class shipped here for #113 was inert, the sticky chip had `z-index: auto`, and `snap` reported it as
// DEAD CSS on every drive. The arbitrary-property spelling is the one every other consumer uses (the tabs
// primitive's `z-(--z-raised)`), and it is what actually raises the chip above the prose scrolling under it.
//
// THE DECLARED Z-ORDER OF A MESSAGE ROW (#167 — stated because enabling that class re-ordered layers that
// had only ever composed by accident, and because #168 turns on exactly this order):
//   0. the row's own content — bubble, prose, tool blocks, metadata: `z-index: auto`, in DOM order.
//   1. the ATTRIBUTION BAND (this constant), `--z-raised` = 10, positioned (`sticky`) — deliberately the
//      only raised layer INSIDE a row, so a tall turn's speaker name stays readable with its own prose
//      running under it. It must out-paint (0) and must never out-paint the shell.
//   2. the shell's chrome — topbar, panels, composer, overlays: `--z-overlay` (40) and up, in the shell's
//      own stacking contexts, always above a row.
// The band's raise is scoped to its ROW's stacking context (`.shell-grid` sets `isolation: isolate`, and
// the row is plain flow), so it can never leak over a panel — and it only wins against a sibling that stays
// in the SAME context: any row content that minted its own stacking context (a transform / filter /
// non-`auto` z-index / `opacity < 1` on the bubble subtree) would paint in its own layer and could still
// cover the band. No such sibling exists on the tree today (measured — see the #168 note above), and the
// fence that keeps it that way is the hit-test CT, never a per-skin class.
export const STICKY_ATTRIBUTION_CHROME = "not-in-data-[has-bg-image]:-my-row sticky top-0 z-(--z-raised) rounded-card bg-card py-row";
