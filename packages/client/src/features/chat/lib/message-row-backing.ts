// The chat surface's LEGIBILITY BACKINGS — one seam, split out of message-row-variants.ts
// to keep it under the 450-line component-size cap (UI-Architecture §2.1). Named for the message row it was
// minted from; the over-art rule it carries is the CHAT SURFACE's, and the character bar takes it too (#229).
//
// ── THE DERIVE LAW (#204) — a plate and its ink come from ONE palette, and a surface cannot exist
// outside the law ────────────────────────────────────────────────────────────────────────────────────
// Every constant here pairs a PLATE with an INK from the SAME derivation root (`--color-background`,
// clamp.ts): the over-art plates ride `--color-reading-plate` (base + THEME_DERIVATION.readingPlate.deltaL
// at .alpha — the palette-following over-art text backing) and carry the palette's matching ink CLASS in
// the same string, so a skin can never again take the plate without the ink. #204's root cause was the
// un-paired version of exactly this file: the plates rode `--color-scrim` — the app's polarity-FIXED
// dimming smoke, which a carried theme's ramp never re-derives — so a carried LIGHT palette put its DARK
// inks on the app's DARK plate (dialogue 1.32:1, body 1.14:1, measured live 2026-08-18 in the owner's
// room). `--color-scrim` itself was RETIRED over it (owner ruling, #204): the one token was triple-duty —
// dialog/drawer/select backdrop + shell dismiss scrim + readability halo AND this reading plate — and the
// first two jobs are polarity-FIXED (dimming means darker in every palette; the light seed deliberately
// keeps a dark smoke for its dialogs) while the plate job must FOLLOW the palette. One token cannot serve
// both, and the overloaded name was the attractive nuisance that caused the bug (this file's author
// reached for the token literally named "scrim", citing the Dialog seal's legibility recipe). The split:
// `--color-backdrop` (fixed smoke: overlays/dismiss/wallpaper-dim) · `--color-reading-plate` (derived,
// this file + the shell's over-photo text halo). A token names ONE polarity semantic.
//
// The ink side of the law: paragraphs/name text must never depend on INHERITANCE for their colour over a
// plate — `.shell-grid` resolves `color: var(--color-foreground)` ABOVE every ThemeScope, so inherited
// ink is the VIEWER's palette while the plate follows the CARRIED one (the #204 two-polarity paragraph).
// Each plate constant therefore names its ink token beside its fill, gated by the same wallpaper flag.
//
// The first FOUR are the background-PHOTO backings (the side-eye P1 + its follow-up, extended by #106,
// #229 and #468) — reading surface, floating CHIP, full-bleed BAND, LOADING block: all self-gated by
// Tailwind's `in-*` ANCESTOR variant on `data-has-bg-image` (the shell grid stamps it, shell.css) — the
// declarative way to react to a shell-level flag with NO render-time DOM read — so they are INERT without
// a bg image (a plain background is byte-identical to pre-fix). They differ ONLY in ink and geometry,
// never in the plate.
//
// The two STICKY pins (`STICKY_ATTRIBUTION_CHROME` #113 and its inside-the-container twin #288) are NOT
// wallpaper-gated, because what they back the chrome against is the row's own scrolling prose rather than
// a photo. Read their own notes before merging them with the four — they answer different questions and
// share only a visual recipe.
//
// All are static (no transition) ⇒ reduced-motion-safe.

import { WALLPAPER_PLATE } from "@orb/ui/lib";

// Reading backing (side-eye live P1, 2026-07-09): flat/hush/document carry NO bubble fill, AND the shell
// strips their float halo (they stamp `data-slot="message-bubble"`, which the client globals target to kill the
// text-shadow "bubbles carry their own fill" — but these three don't), so their body text landed DIRECTLY
// on the photo → 2.0–2.4:1 on bright (sky) patches, the house §0 reading-surface #1 defect. Back the text
// with the derived `--color-reading-plate` + `backdrop-blur-sm` (blur collapses the bright peaks a flat
// plate alone can't; the alpha floor is proven in palette-contrast.suite.test.ts) — AND ink the plate
// from the same palette: `text-prose-body`, the theme's reading ink, clamped for legibility against the
// base by the §7a prose-ink clamp (clamp.ts). Without the ink half, flat/hush painted a carried theme's
// plate under the VIEWER's inherited foreground — the #204 defect. Applied to `skin.inner` (the bubble)
// of the three no-fill modes; the filled modes' bubble fill already pairs its own derived foreground
// (`messageBubbleClass` — those SHIP as-is).
export const BG_PHOTO_READING_PLATE = "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:text-prose-body";

// Chrome backing (name + action-icon row) — side-eye P1 follow-up (2026-07-09). That row is a SIBLING
// rendered ABOVE the bubble (message-row.tsx; verified: it sits entirely above the bubble box in EVERY
// mode, ~8px gap — never on the fill), so in the no-fill modes it floated on the raw photo → the
// interactive action icons hit 1.83:1 (fails WCAG 1.4.11's 3:1). Same plate + blur as the reading
// surface, as its own rounded CHIP (`rounded-card` + a little padding) — plus the paired ink
// (`text-foreground`, the derived neutral): on the app's own themes this is byte-identical to what the
// chip's text already inherited from `.shell-grid`, and under a carried palette it is what flips the
// name/icon ink WITH the plate (#204). The name's authored `text-speaker` and the timestamp's
// `text-muted-foreground` keep their own (derived/clamped) tokens and simply win over this base.
//
// WHERE IT IS APPLIED, and the 2026-08-16 correction (#106). The chrome BELOW the bubble — the metadata
// row and the message-footer disclosures — takes it MODE-INDEPENDENTLY from message-row.tsx. The sentence
// this comment used to end with did NOT stand: the filled modes' chrome "passed the side-eye's live
// measurement ... flagged for the coordinator either way". That pass was CIRCUMSTANTIAL — it was measured
// under the owner's dark wallpaper. Re-measured against the worst LEGAL background (a pure-white wallpaper
// at `backgroundDim` 0 — which was legal then: `BACKGROUND_DIM_MIN` was 0. #487 floored it at 0.45, so the
// worst legal art is now SCRIMMED, and the numbers below are the strictly-worse pre-floor arm. The finding
// stands unchanged — a floored scrim narrows the composite, it does not anchor an unbacked band), that chrome
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
// ── #288 TRUTH-REPAIR: THE PREMISE ABOVE IS DEAD, THE RULING IS NOT ──────────────────────────────────
// The load-bearing sentence in both paragraphs above — "the name row sits entirely above the bubble box
// in EVERY mode … a mode's FILL therefore cannot back its name row" — described an ANATOMY, and #288
// changed the anatomy. In seven of the eight skins the header is now the CONTAINER's own first child
// (`RowSkin.headerPlacement`, message-row-variants.ts), so a mode's fill/plate is exactly what backs it.
//
// #167's RULING is untouched and is why the move was safe: the speaker name and its timestamp are a
// legibility GUARANTEE over any art in any skin, never a per-skin opt-in. What changed is the HOW. The
// chip was a second surface minted to carry that guarantee for a row that had no surface of its own; a
// header inside the container inherits the guarantee from the box the prose already rides, and it does so
// in one fewer object. Do not read this as "#167 was wrong and the chip is optional": remove the header
// from the container without re-adding the chip and the 1.63:1 timestamp comes straight back.
//
// This constant therefore keeps TWO live jobs and loses one:
//   · the chrome BELOW the bubble (metadata row, swipe strip, message footer) — unchanged, mode-independent;
//   · `tide`'s header, the one skin still `outside` (a train of pills has no single container) — the #167
//     guarantee reaching the one row that still needs a surface minted for it;
//   · it no longer lands on the other seven skins' headers. That is the two-plate split (#288) closing.
//
// Self-gated on `in-data-[has-bg-image]` like its sibling, so a plain-background theme is byte-identical.
export const BG_PHOTO_CHROME_PLATE: string = WALLPAPER_PLATE.chrome;

// Pager text needs the card's opaque foreground/surface pair; art composites at legal palette pivots fail AA.
export const BG_PHOTO_PAGER_PLATE =
  "in-data-[has-bg-image]:bg-card in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row in-data-[has-bg-image]:text-card-foreground";

// The band, loading and error plates live with this one in `@orb/ui` (`WALLPAPER_PLATE`): they are the `plate`
// prop on `Row` and `Stack`, so a feature never imports a class string for them.

// STICKY SPEAKER ATTRIBUTION (#113) — a DIFFERENT backing from the two above, deliberately not merged
// with them. Those two answer "the chrome is floating on a wallpaper at rest" and are wallpaper-gated.
// This one answers "the chrome is now floating over the row's OWN prose", which is true regardless of
// theme: inside a turn taller than the screen the name row is pinned to the top of the scrollport and the
// body scrolls underneath it, so it needs an OPAQUE chip in EVERY mode, wallpaper or not.
//
// THE FILL IS OPAQUE, NOT A TRANSLUCENT PLATE (#168, owner-observed live 2026-08-18: the band
// "lets some partial of the message you are on go above it"). It shipped as a 60%-alpha overlay fill —
// so the prose running under the pinned band stayed VISIBLE THROUGH it, blurred and dimmed but legibly
// moving. That is the whole defect: a pinned band that does not own its slice. An occluding sticky header
// is the house recipe already (`modal-host.tsx`'s `sticky top-0 z-(--z-raised) … bg-card`,
// `preset-editor-surface.tsx`'s `sticky top-0 z-(--z-raised) bg-card`), and an opaque fill makes
// `backdrop-blur` dead paint, so the blur went with the translucency. That ruling is UNTOUCHED below —
// what changed is WHICH opaque colour.
//
// THE OPAQUE COLOUR IS THE READING PLATE'S, AT ALPHA 1 (`bg-reading-band`, #241 — owner-ruled off #223).
// #168 reached for `bg-card` because an opaque ramp surface was the nearest house recipe. But the prose
// this band pins itself over rides `--color-reading-plate` (base −0.038) while `card` is base +0.047: one
// column, two backings, a CONSTANT ΔL ≈ 0.085 apart, filed by the owner as an unintended step ("two
// stacked whites of different opacity per message", chats-rescore 2026-08-18 → #223). Matching the two
// numbers by hand would leave them free to drift apart at the next retune; DERIVING the band from the
// plate makes the step impossible — `--color-reading-band` uses `THEME_DERIVATION.readingPlate.deltaL`
// at `READING_BAND_ALPHA`, emitted beside the plate by the same clamp, so a carried
// palette moves both together or neither. Its ink is the PAIRED `text-foreground` (#204), the base's own
// derived neutral — the same ink the wallpaper chip pairs with its plate, and the pairing
// `palette-contrast.suite.test.ts` floors this surface against. It is no longer a ramp member, so
// `text-card-foreground` would now be naming a different palette root than its fill (on orb's own themes
// the two resolve identically — card-foreground IS foreground — so this is byte-identical there and
// load-bearing only under a carried palette, exactly like the plate's own pairing).
//
// It also SUPERSEDES the wallpaper chip rather than stacking with it (`nameRowFrame`, message-row-parts.tsx):
// an opaque fill is a strict superset of a translucent one, and the two classes are the same property —
// stacking them let `in-data-[has-bg-image]:bg-reading-plate` win on specificity over art, which is
// exactly the mount the live receipt came from.
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
// `BG_PHOTO_CHROME_PLATE`'s `py-row`; both `py-row`s resolve to one padding, so an unconditional `-my-row`
// SHRANK the row by 2×--spacing-row the moment it went sticky — measured at 16px, i.e. the exact reflow
// this pair exists to prevent, on exactly the tall rows it exists to help. (That arithmetic was already
// wrong for flat/hush/document, whose chip predates this note; making the chip universal is what made it
// measurable.) Gate the compensation on the padding's owner instead: no wallpaper ⇒ this constant's own
// `py-row` is cancelled as before; wallpaper ⇒ the plate's padding stands and nothing is cancelled, so
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
//
// LAYOUT AND PAINT ARE SPLIT, AND ONLY THE PAINT FOLLOWS THE PIN. `exceedsViewport` is true for every reply
// taller than the scrollport, including while its header sits at rest at the top of the reply. A band
// painted there reads as a second object on top of the bubble. So the box (sticky, offset, raise, the
// cancelled padding) applies for the whole sticky verdict and never moves, and the fill and its ink apply
// only while the header is actually pinned (`usePinnedHeader`). Toggling paint cannot re-enter the verdict.
// The offset is `-top-px` rather than `top-0` because the observer reads the pin as a one-pixel top clip.
export const STICKY_ATTRIBUTION_CHROME = "not-in-data-[has-bg-image]:-my-row sticky -inset-bs-px z-(--z-raised) py-row";

/** What a sticky outside header paints while NOT pinned: the wallpaper chip's plate and ink without its
 *  padding, which the sticky box already carries as `py-row`. With no wallpaper, it paints nothing. */
export const STICKY_ATTRIBUTION_REST_PAINT =
  "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:text-reading-plate-foreground";

// THE SAME PIN, FOR A HEADER THAT LIVES INSIDE ITS CONTAINER (#288). The box differs from the sibling's in
// one forced way: the cancellation is unconditional and TOP-ONLY (`-mt-row pt-row`). `exceedsViewport` is
// computed from the measured row height, so any box this constant changed would re-enter the verdict that
// applied it and oscillate the transcript (#1873); the bar adds only its own top padding and cancels it, so
// the name lands on exactly the pixel it occupied at rest. The inside header's minimum height is
// `box-content`, so this padding stacks on it and the cancellation stays exact.
//
// The PAINT while pinned is each chat style's (`RowSkin.pinnedHeader`, row-edges.ts): the row's own surface
// reaching the row's edges, with a fade below it that is out of flow (`top-full`), so it adds no box to any
// ancestor and the line passing under the bar's edge dissolves rather than being cut. At rest an inside
// header sits on the bubble's own surface with the bubble's ink, exactly like a short reply's.
export const STICKY_ATTRIBUTION_CHROME_INSIDE = "-mbs-row sticky -inset-bs-px z-(--z-raised) pbs-row";
