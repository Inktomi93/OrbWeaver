---
kind: review
status: archived
updated: 2026-08-30
---

# Transcript reading surface over wallpaper — forensic handoff (issue #204) — 2026-08-18

Lane `reading-surface`. **Read-only: no source file was changed.** Every number below was produced in
this session against the LIVE stack on `:5173`, room `chat_01m09wfs72f27bqt8t15z09p0r`
("Example — The Rust Lecture"), via `node scripts/probes/snap.ts /chats --open-chat <id>`. Every
mechanism claim carries a `path:line` receipt read on today's tree.

The lane's mandate changed mid-run from "fix" to "forensics + recommended direction". What follows is
the evidence a designer/implementer needs; §7 is the direction I would have built, §8 is a ruling fork
the orchestrator owns.

## 0. The one-sentence root cause

**The P0 is not a luminance-blind scrim. It is a SURFACE/INK DIVORCE:** the room wears a card-carried
theme whose every ink was derived for that theme's own LIGHT base surface, while the surface the prose
is actually painted on is the app's fixed DARK `--color-scrim` — because `--color-scrim` is the one
surface token the carried theme's neutral ramp does not emit. Dark ink lands on a dark plate.

**Corollary that kills one proposed fix outright:** an alpha-only remedy (sample the wallpaper, raise
the scrim alpha) *cannot* fix this room. Pushing the dark scrim to α = 1.0 leaves an `oklch(0.4 …)` ink
on an `oklch(0.12 …)` plate at ≈ 2.4:1. The failing ink is DARK; making the plate darker makes it worse.

## 1. The polarity map (measured)

The room's transcript sits under a per-row / per-room `ThemeScope` carrying Birdie Mae Holloway's
`themeOverride` (the true-solo carried-theme takeover). Its FULL inline custom-property block, captured
live off `[data-slot="theme-scope"][style]`:

| Custom property | Value in this room | Polarity |
| - | - | - |
| `--color-background` | `oklch(0.98 0.004 78)` | LIGHT |
| `--color-card` | `oklch(from oklch(0.98 0.004 78) calc(l + 0.047) c h)` → resolves **`oklch(1 0.004 78)`** | LIGHT (white) |
| `--color-foreground` | `oklch(from oklch(0.98 …) clamp(0.22, (0.62 - l) * 1000, 0.96) 0 h)` → **0.22** | DARK |
| `--color-ai-bubble` | `oklch(0.97 0.006 78)` | LIGHT |
| `--color-dialogue` | `oklch(0.4 0.1 40)` | DARK |
| `--color-narration` | `oklch(0.42 0.03 78)` | DARK |
| `--color-prose-body` | `oklch(0.28 0.015 62)` | DARK |
| `color-scheme` | `light` | LIGHT |
| **`--color-scrim`** | **`oklch(0.12 0.006 60 / 0.6)` — the APP value, NOT re-derived** | **DARK** |

`--color-scrim` is absent from `THEME_SCOPE_EMIT_VARS`
(`packages/ui/src/content/theme-scope/clamp.ts:60-99`) and absent from `SURFACE_RAMP_DELTAS`
(`:111-120`), so it alone of the neutral surfaces never rides the carried ramp. That is the hole.

### 1a. The second, independent polarity split: inherited ink vs token ink

`.shell-grid` sets `color: var(--color-foreground)` (`packages/client/src/features/app-shell/surfaces/shell.css:32`)
and **resolves it there** — measured `getComputedStyle(.shell-grid).color === "oklch(0.955 0.004 75)"`
(the viewer's LIGHT ink). The carried `ThemeScope` is a `display: contents` div INSIDE `.shell-grid`
(measured: `shell.contains(scope) === true`), so its `--color-foreground: 0.22` override is **inert for
inherited text** — a descendant that does not name a colour token inherits the shell's already-computed
light value.

Measured inside ONE paragraph of the same bubble:

| Node | Rendered `color` | Source |
| - | - | - |
| `p` (unmarked prose) | `oklch(0.955 0.004 75)` | inherited from `.shell-grid` — the VIEWER's ink |
| `em` (narration) | `oklch(0.42 0.03 78)` | `[&_em]:text-narration`, `packages/ui/src/markdown/markdown.tsx:164` |
| `span[data-slot="dialogue"]` | `oklch(0.4 0.1 40)` | `text-dialogue`, `packages/ui/src/markdown/dialogue-paragraph.tsx:54` |

**Two opposite ink polarities in the same paragraph, over one plate. No plate colour can satisfy both.**
That is the mechanical explanation of the "pixel lottery" the reviewer saw (1.14:1 vs 14.94:1 on the
same selector): the verdict depends on which of the two ink families the probe's first in-viewport match
happened to land on, and on which art patch sits behind it.

### 1b. Contrast receipts (`snap --contrast … --contrast-pixel`, this room)

Owner's real settings row (no `--appearance-preset`):

| Selector | Ratio | Verdict |
| - | - | - |
| `[data-slot=dialogue]` | **1.32:1** | FAIL (need 4.5) |
| `[data-slot=message-bubble] p` | **1.14:1** | FAIL |
| `[data-slot=message-metadata-timestamp]` | 11.31:1 | PASS |

Across the curated presets (`scripts/probes/appearance-presets.json`):

| Preset | `[data-slot=dialogue]` | `message-bubble p` | `message-bubble em` |
| - | - | - | - |
| `defaults` | 1.71 FAIL | 1.13 FAIL | 2.29 FAIL |
| `reading` (22px) | 2.03 FAIL | 1.32 FAIL | 2.20 FAIL |
| `maximal` | **7.34 PASS** | 1.07 FAIL | **7.02 PASS** |
| `compact` | 1.25 FAIL | **17.14 PASS** | 1.31 FAIL |

Read the `maximal` and `compact` rows carefully — they are the proof that this is not a single dial.
`maximal` turns the theme inks PASS and leaves the viewer-ink `p` at 1.07; `compact` does the exact
inverse (`p` 17.14 PASS, theme inks FAIL). The two ink families trade places. **A fix that moves only
the plate will always be trading one of these for the other.**

### 1c. The decisive A/B (hypothesis confirmed live, in-page, nothing written)

`--eval 'document.documentElement.style.setProperty("--color-scrim","oklch(0.98 0.004 78 / 0.78)")'`
— i.e. give the plate the carried theme's own polarity, changing nothing else:

| Selector | Before | After |
| - | - | - |
| `[data-slot=dialogue]` | 1.32:1 FAIL | **8.14:1 PASS** |
| `[data-slot=message-bubble] p` | 1.14:1 FAIL | 1.13:1 FAIL (expected — this is the VIEWER's light ink) |

One property, +6.8 ratio points on the theme inks. The residual `p` failure is exactly §1a and is what
F2 (below) addresses.

## 2. The 8-skin ink audit — where each skin gets its plate and its ink

`MESSAGE_ROW_SKINS`, `packages/client/src/features/chat/lib/message-row-variants.ts:169-217`.
"Plate over wallpaper" = what actually paints behind the prose when `[data-has-bg-image]` is on.

| Skin(s) | `inner` | Plate over wallpaper | Body ink | Coherent? |
| - | - | - | - | - |
| `bubble`, `echo`, `whisper`, `ripple`, `tide` | `bubbleInner` = `messageBubbleClass` (`packages/client/src/lib/message-bubble-class.ts:24-27`) | `--color-*-bubble` — the THEME's own fill | `text-*-bubble-foreground` — **derived from that fill** (`clamp.ts:233-245`) | **YES** for body prose |
| `flat`, `hush` | `flatInner` (`message-row-variants.ts:71-73`) = `w-full px-section py-row` + `BG_PHOTO_READING_SCRIM` | `--color-scrim` — the APP's fixed dark plate | **no colour token at all** → inherits `.shell-grid`'s resolved `--color-foreground` (the VIEWER's) | **NO — plate is app, ink is viewer, spans are theme** |
| `document` | `message-row-variants.ts:184` = `text-prose-body` + `BG_PHOTO_READING_SCRIM` | `--color-scrim` — the APP's fixed dark plate | `--color-prose-body` — the THEME's | **NO — theme ink on an app plate** |

Applies to ALL EIGHT, independent of skin:

| Span | Ink token | Guaranteed against its plate? |
| - | - | - |
| `span[data-slot="dialogue"]` | `--color-dialogue` (author-picked, pass-through) | **NO** — `clampThemeTokens` `put()`s it raw, `clamp.ts:229` |
| `em` | `--color-narration` (author-picked, pass-through) | **NO** — `clamp.ts:230` |
| speaker name | `--color-speaker` (author-picked, pass-through) | **NO** — `clamp.ts:228` |

**The shape of the hole, stated exactly.** `clamp.ts:124-128` states the house law: *"a foreground is
never picked directly, only derived, so 'set everything white' can't produce invisible text."* That law
is enforced for `--color-*-foreground`, `--color-muted-foreground`, `--color-primary-foreground` — and
it is NOT enforced for the four prose inks (`speaker`, `dialogueColor`, `narrationColor`, `bodyColor`),
which are the only inks a reader actually reads a transcript with. Those four are the exact fields that
broke.

**Correction to a premise in circulation:** the brief said the body prose is "wired in 1 of 8 skins".
The measured truth is finer and matters for the fix: 5 of 8 skins wire body ink CORRECTLY (the derived
bubble foreground, over their own fill); 2 of 8 (`flat`, `hush`) wire NO body ink token at all; 1 of 8
(`document`) wires `--color-prose-body`. The room in the owner's screenshot is `flat` — measured bubble
class `flex flex-col gap-row w-full px-section py-row in-data-[has-bg-image]:bg-scrim
in-data-[has-bg-image]:backdrop-blur-sm`. The `reading` preset forces `document`, which is why its
numbers are bad in a different way (ALL its prose is theme-dark on an app-dark plate).

## 3. Implicated-site census

| Site | Role in the defect |
| - | - |
| `packages/ui/src/content/theme-scope/clamp.ts:111-120` (`SURFACE_RAMP_DELTAS`) | the neutral ramp; `--color-scrim` is missing from it |
| `packages/ui/src/content/theme-scope/clamp.ts:60-99` (`THEME_SCOPE_EMIT_VARS`) | the emit-surface contract; would need the new key |
| `packages/ui/src/content/theme-scope/clamp.ts:228-231` | the four unguaranteed prose inks (`put()` pass-through) |
| `packages/kit/src/theme-derivation/index.ts` | `THEME_DERIVATION` + the WCAG math (`wcagContrastRatio`, `oklchToSrgb`, `derivedForegroundLightness`) — a proof test has everything it needs here |
| `packages/contracts/src/theme/override.ts:80-94` | `THEME_KEY_REACH`; `background`, `dialogueColor`, `narrationColor`, `bodyColor`, `speaker` are all `card-embeddable` |
| `packages/contracts/src/chat/roster.ts:366-369` (`resolveCarriedTheme`) | the true-solo takeover that puts the card's palette on the room |
| `packages/client/src/features/chat/lib/attribution.ts:225` / `:271-279` (`characterTint`) | the per-row scope; `projected=false` for the row means the FULL override (incl. `background` → the whole ramp) applies |
| `packages/client/src/features/chat/lib/message-row-backing.ts:24` (`BG_PHOTO_READING_SCRIM`) | the plate: `in-data-[has-bg-image]:bg-scrim backdrop-blur-sm` |
| `packages/client/src/features/chat/lib/message-row-backing.ts:62` (`BG_PHOTO_CHROME_SCRIM`) | the non-sticky name-row chip, same scrim |
| `packages/client/src/features/chat/lib/message-row-backing.ts:130` (`STICKY_ATTRIBUTION_CHROME`) | the sticky band: `bg-card`, which DOES ride the carried ramp → white |
| `packages/client/src/features/chat/surfaces/message-list-surface.tsx:323` | `className="h-full py-block"` on the scroller — the 12px sticky bleed |
| `packages/ui/src/primitives/message-list/message-list.tsx:417` | where that className lands (`data-slot="message-list-scroll"`) |
| `packages/client/src/features/chat/components/message-row-parts.tsx:292-306` (`nameRowFrame`) | the chrome row whose height the hidden action cluster sets |
| `packages/client/src/features/chat/components/message-actions-row.tsx` | the 34px, `opacity: 0` cluster that sets it |
| `packages/ui/src/markdown/markdown.tsx:164` · `packages/ui/src/markdown/dialogue-paragraph.tsx:54` | the two theme-ink spans, applied in every skin |
| `packages/client/src/features/app-shell/surfaces/shell.css:32` | `.shell-grid { color: var(--color-foreground) }` — where the viewer's ink is resolved, above every scope |

## 4. Defect 2 — the 12px guillotined prose line above the sticky band

**Measured, this room, 1280×800:** `[data-slot=message-list-scroll]` box top `y = 48`, its computed
`padding-top: 12px`; the pinned `[data-slot=message-name-row][data-sticky]` sits at `y = 60` with
`top: 0px`, `position: sticky`. Re-measured at three scroll depths — identical. `60 − 48 = 12`.

**Root cause:** the scroller carries `py-block` (`message-list-surface.tsx:323`, deliberate — its own
comment says "the first/last rows breathe off the topbar/composer edges"), and Chrome resolves
`position: sticky; top: 0` against the scroll container's **content** box, not its padding box. So the
band pins 12px below the true top of the scrollport and a 12px strip of the row's own prose renders
permanently above it, half-cut.

**Room-independent by construction:** the padding is on the ONE transcript surface, not on any room's
data, which is why the reviewer saw it in all four rooms
(`reports/snaps/rail-chats-stickybleed-crop.png`). `--spacing-block` = 12px; under a `compact` density
it would be 8px, so the strip is token-sized, not a constant.

**Two candidate fixes, both one line:**

1. Offset the band by the scroller's own block padding — `top-0` → `-top-block` in
   `STICKY_ATTRIBUTION_CHROME`. Cheap, but it silently couples a client constant to a padding token
   owned by a different component; if the surface ever drops `py-block` the band overhangs.
2. Move the breathing room INSIDE the scroll content — drop `py-block` from the scroller and put it on
   `[data-slot="message-list-viewport"]` (`message-list.tsx:423`). Then the content box IS the padding
   box and `top-0` is correct for any future sticky. This is the real fix; it touches the `@orb/ui`
   primitive and must be checked against the virtualizer's `paddingStart`/`paddingEnd` accounting and
   the `isAtEnd` tolerance the same comment mentions.

## 5. Defect 3 — "the name is separated from the messages" + the phantom empty scrim bands

**One mechanism, and it is not a spacing bug.** Measured geometry of a settled name row
(`--appearance-preset defaults`, identical at the owner's real row):

| Node | Height | Notes |
| - | - | - |
| `[data-slot="message-name-row"]` | **50px** | the painted chip |
| `[data-slot="message-attribution"]` (the name + timestamp) | **16px** | the only thing visible at rest |
| `[data-slot="message-actions-row"]` | **34px**, `opacity: 0` | hover-reveal; `messageActions: "hover"` |
| gap to the bubble | **8px** | `message-content-column` `gap: 8px` (`gap-row`) |

`50 = 34 + 2 × 8` — the chip's height is set **entirely by the invisible action cluster**, and
`py-row` pads that. So at rest a 16px name is centred in a 50px painted slab with \~17px of empty
painted scrim above it and \~17px below, then an 8px gap before the prose. The name's baseline sits
**\~42px** clear of its first line of prose, inside a band whose visible mass is three times the glyph
height.

That is BOTH owner complaints at once:

- **"the name is separated from the messages"** — the detachment is the 17px + 8px of painted-then-empty
  space below the name, not a margin anyone chose.
- **"phantom empty scrim bands"** — the empty top and bottom thirds of the chip ARE the phantom bands.
  They are not a stray element; they are the reserved-but-invisible action-cluster row, which became
  *visible* the moment the chip became universal (`nameRowFrame`, 94636b0ed) because it now paints a
  background over space that used to be transparent.

**A second, independent visual break in the same band.** Adjacent name rows in one transcript render in
**opposite polarities**, decided only by whether the virtualizer measured the row as taller than the
scrollport:

| Row | Name-row class | Measured `background-color` |
| - | - | - |
| tall (sticky) | `STICKY_ATTRIBUTION_CHROME` → `bg-card` | `oklch(1 0.004 78)` — **white**, because `--color-card` DOES ride the carried ramp |
| short | `BG_PHOTO_CHROME_SCRIM` → `bg-scrim` | `oklch(0.12 0.006 60 / 0.6)` — dark, because `--color-scrim` does NOT |

Three rows of one transcript, two of them white slabs and one a dark slab, is visible in this session's
own capture `reports/snaps/reports/snaps/rs-before-rust.png` (note the doubled path — `snap --out`
re-prefixes `reports/snaps/`, worth a separate fix). Fixing §0 (`--color-scrim` joins the ramp) collapses
this split automatically: both arms then derive from the same base surface.

## 6. What the owner's "auto fixer for picking the right colors for a chat" actually is

Three separate mechanisms wear that description; only one of them is running in this room, and it is
NOT the one named in the settings UI.

1. **The carried-theme takeover — this is the one that is running.** `resolveCarriedTheme`
   (`packages/contracts/src/chat/roster.ts:366`) → in a room with one human and one character, the
   character's authored `themeOverride` becomes the room's palette (D44 §12.1). No contrast step of any
   kind is applied against the surface the room actually paints.
2. **The per-speaker hue hash** — `colorForCharacter`
   (`packages/client/src/features/chat/lib/speaker-color.ts:34-41`), a deterministic FNV-1a hue at a
   FIXED `oklch(72% 0.16 h)`. It is the fallback for a card with no override, and it is *not implicated
   here* (Birdie has an override). Worth noting it hard-codes a LIGHT lightness, so it is safe on a dark
   plate and would be equally unguaranteed on a light one.
3. **`appearance.enableThemeColorization`** — the switch literally labelled *"Tint the UI with the
   accent color"* (`packages/client/src/features/app-shell/components/appearance-effects-section.tsx:147`).
   It only retints `--color-border` / `--color-sidebar-border`
   (`packages/client/src/styles/globals.css:343-355`). **It has nothing to do with transcript ink** —
   do not send an implementer there on the strength of the name.

So the answer to "does the auto fixer owe a contrast guarantee for the ink side": **yes, and it is
mechanism 1 + the four pass-through ink fields at `clamp.ts:228-231` that owe it** — not the settings
toggle.

## 7. Recommended direction (F1/F2/F3) — not built, offered

Ordered by what each buys. F1 alone is the measured 1.32 → 8.14 step.

**F1 — `--color-scrim` joins the derived neutral surface ramp.** Add it to `SURFACE_RAMP_DELTAS` +
`THEME_SCOPE_EMIT_VARS` in `clamp.ts`, with its delta and alpha declared as `THEME_DERIVATION` constants
in `packages/kit/src/theme-derivation/index.ts` (one home; `@orb/server`'s theme importer must be able
to predict it). The app's own dark scrim `oklch(0.12 0.006 60 / 0.6)` is exactly
`--color-background oklch(0.158 0.006 60)` at `deltaL = −0.038, alpha = 0.6` — so the base themes are
reproduced to the digit and only carried/user themes change behaviour. Coupled sites: the contracts↔ui
pairing test, the emit-surface test that asserts the output keys match `THEME_SCOPE_EMIT_VARS` exactly,
`packages/ui/src/tokens/tokens.json` if the token is also declared there.

*Alternative worth weighing:* rather than re-deriving `--color-scrim` (which is a general-purpose token
with consumers well outside the transcript — the Dialog seal, `shell.css`'s text-shadow halo), mint a
dedicated `--color-reading-plate` and point `BG_PHOTO_READING_SCRIM` / `BG_PHOTO_CHROME_SCRIM` at it.
That keeps the blast radius inside the reading surface and gives the concept a name. I lean this way.

**F2 — close the inherited-ink hole in `flat`/`hush`.** Those two skins are the only ones that paint
prose with no colour token; give them the same theme ink `document` uses (`text-prose-body`) so all
transcript ink in a no-fill skin comes from ONE palette. This is what removes the two-polarity paragraph
(§1a) and the residual 1.13:1 in the A/B. Note the visible side effect: on the app's own themes
`--color-prose-body` is `oklch(0.9 0.008 72)` vs the inherited `oklch(0.955 0.004 75)`, i.e. body prose
gets very slightly softer everywhere in `flat`/`hush`. That is a deliberate product change and should be
shown to the owner, not slipped in.

**F3 — make the plate's alpha a PROVEN floor instead of the number 0.6.** With F1 in place, hand-arithmetic
(worth re-deriving in code) says the plate needs α ≈ 0.65 for the *derived* foreground to clear AA over
**any** art in **both** polarities: dark plate `oklch(0.12)` + white art needs α ≥ 0.64; light plate
`oklch(0.94)` + black art needs α ≥ 0.57. That is a \~0.05 bump from today and is essentially invisible.
Pin it with a unit test that recomputes the composite with `oklchToSrgb` + `wcagContrastRatio` from
`@orb/kit/theme-derivation` — the same shape as the existing `palette-contrast.suite.test.ts`.

**The honest limit of F1+F2+F3, stated because it is the thing a designer must rule on:** those three
guarantee AA for *derived* inks over any art. They do **not** guarantee it for the four AUTHOR-PICKED
prose inks, because those are `card-embeddable` pass-through by ruling (§2). For this room's
`oklch(0.4 0.1 40)` dialogue on a light plate, a worst-case-art guarantee would need α ≈ 0.90 — which
does start to flatten the art. There are exactly two ways to close that last gap and both are product
decisions, not engineering ones:

- **(a) clamp the picked inks' LIGHTNESS** against the plate the same way `foregroundOn()` clamps
  foregrounds — keep the author's hue and chroma, derive only L. Identity preserved, legibility
  guaranteed, and it is a **no-op wherever the card was already sensible** (so the dark-art room does not
  move a pixel). This is the fix that is consistent with the house law at `clamp.ts:124-128`, and it is
  my recommendation if the owner will accept that a card can no longer pick an unreadable ink.
- **(b) accept the AA miss for author-picked inks** and treat §7's F1–F3 as the floor, documenting that
  a card author owns their own legibility.

## 8. RULING FORK — the file's own header contradicts the brief

`packages/client/src/features/chat/lib/message-row-backing.ts:39-40`, verbatim:

> Extending the existing mechanism is the ruled fix (#106); an adaptive sampled-luminance scrim was
> **DECLINED**.

The dispatch brief's first proposed arm was *"sample the wallpaper's luminance behind the reading column
and drive the scrim (alpha and/or a lightness-locked plate)"* — i.e. the declined mechanism.

**What I did:** I did not design toward sampling. F1–F3 are static CSS + a derivation constant, which is
"extending the existing mechanism" as #106 ruled, and they satisfy today's symptom anyway. **What I
refuse:** silently reversing #106 by building a sampler. **What the orchestrator owns:** whether the
last gap in §7 (author-picked inks over worst-case art) is closed by the ink clamp (7a), accepted (7b),
or by re-opening #106. I recommend 7a.

Second, smaller fork: `message-row-backing.ts:70-81` (#168) rules that the sticky band's fill is OPAQUE
`bg-card` and that it deliberately SUPERSEDES the wallpaper scrim. Today's finding (§5) is that this is
what makes adjacent name rows render white-vs-dark in one transcript. **The #168 mechanism is not the
defect and should be preserved** — an opaque band that owns its slice is correct. What is wrong is only
that its `bg-card` and its sibling's `bg-scrim` derive from different bases. F1 fixes that without
touching #168's ruling.

## 9. What I did NOT verify

- **The four-room sticky-bleed claim.** I measured the 12px on ONE room and root-caused it to a surface-level
  padding token that no room's data can vary (§4). I did not re-shoot the other three rooms; the
  reviewer's `reports/snaps/rail-chats-stickybleed-crop.png` stands as that receipt.
- **`design-audit --open-chat` was not re-run** in this session. The 53-P1 figure is the reviewer's
  (`reports/design-audit/root.json`), not mine. My contrast numbers are first-party.
- **No CT was written** — this lane produced no code, so it produced no red-first proof. Any lane that
  builds F1/F2 owes one, and it must assert through the RENDERED composite (pixel sampling), not through
  computed style: `globals.css:381-400` records that this exact surface has a defect class that is
  invisible to `getComputedStyle` and to design-audit, and was only ever caught by sampling pixels.
- **The dark-art room was not re-measured** after any change (there was no change). Whoever builds F1
  must produce a before/after on it — the owner has called that rendering "the best-looking thing in this
  app" and F1 shifts its plate from `oklch(0.12 … / 0.6)` to `oklch(0.12 … / ~0.65)` at most.

## 10. Constraint list for the designer

1. **Do not reach for scrim alpha as the primary lever.** It is arithmetically incapable of fixing a dark
   ink on a dark plate (§0).
2. **The plate and the ink must come from ONE palette.** Any fix that changes only one of them trades
   `p` against `dialogue`/`em` — that trade is visible in the `maximal` vs `compact` rows of §1b.
3. **The floor must be invisible where the art is already dark.** Every number in §7 was chosen to hold
   the dark-art room within a few percent of today.
4. **Five of eight skins are already correct** (they paint on their own fill with a derived foreground).
   Do not "fix" them; the work is in `flat`, `hush`, `document`, and in the four pass-through ink fields.
5. **`--color-scrim` has consumers outside the transcript** (Dialog seal, `shell.css:43` text-shadow
   halo). Re-deriving it is a wider blast radius than minting `--color-reading-plate`.
6. **The name row's height is owned by an invisible element.** Any spacing tweak that does not address
   the 34px `opacity: 0` action cluster is treating the symptom (§5).
7. **`enableThemeColorization` is a red herring** — it only touches borders (§6.3).
