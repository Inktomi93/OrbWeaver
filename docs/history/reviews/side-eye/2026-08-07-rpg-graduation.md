# side-eye — RPG/persona/chat graduation (rendered lens)

Lane SIDE-EYE-RPG · main @ 20b883e3e · dev stack :5173 (single-user) · 2026-08-07

Deferred **rendered** graduation of RENDERFIX (`6807f5eb4`) + PTRGATE (`cca9715`), both merged and
settled on main. The CTs passed; this is the coarse-pointer rendered check they never got. FOCUSED
review — five named targets, verdicts in rank order. No Nielsen table.

## VERDICT: SHIP — all five targets CONFIRMED on rendered surfaces at coarse pointer.

Every RENDERFIX claim reproduced with a measured/screenshot receipt. Two PTRGATE carriers verified
rendered; the other four are byte-identical relocations, source- + CT-verified, whose live instances I
could not reach (noted). Two out-of-scope stumble findings, both benign (one is a retraction).

Coarse pointer was emulated with real Chromium touch emulation (`mobile,touch`) and asserted
`matchMedia('(pointer:coarse)').matches === true` before every geometry read — not a bare width.

---

## Per-target verdicts (rank order)

### ① Persona DEFAULT crown + FAVORITED heart at coarse — CONFIRMED

Surface: Settings modal → Personas category. Fixture has ONE persona ("Traveler"), which is both
default AND favorited.

- **Rendered (coarse/430):** `reports/snaps/persona-mobile.png` — gold crown + red heart sit on the
  title line beside "Traveler", subtitle "Your default persona". Both visible, not `display:none`.
- **Accessible names (coarse):** `--map` returns `img "Your default"` and `img "Favorited"` — both
  markers carry an accessible name at coarse. The heart is no longer `aria-hidden` on a fine-only
  premise.
- **Arm-swap receipt (separate coarse and fine runs — one call cannot hold both; `--desktop` after
  `--mobile` overrides viewport globally, last-wins):**
  - COARSE: crown (role=img "Your default") `block`; decorative heart (`ROW_ACTION_INLINE`,
    aria-hidden) `display:none`; named heart (role=img "Favorited", `ROW_ACTION_OVERFLOW`) `block`.
  - FINE: decorative heart `block`; named heart `display:none`.
  - ⇒ exactly ONE heart in layout — and in the a11y tree — per pointer class, and at coarse it is the
    NAMED one. Crown keeps its name at both classes (it has no doubling twin). Matches the row's
    header reasoning exactly.
- **Crown non-text contrast:** 7.33:1 (need 3.0, ui-component) PASS. Subtitle 17.14:1 PASS.
- **Not covered / caveat:** only one persona in the fixture, so "identify MY default among several"
  is proven only for the marker+name rendering, not for discrimination across a multi-row list. The
  a11y arm and coarse visibility are the substance of the fix and are confirmed.

### ② rpg game-rail touch floor + solid frame — CONFIRMED at 430 / 375 / 320 coarse

Surface: seeded d20 game (`__orb.seed.game`), CONTEXT panel → Game-state rail
(Status/Inventory/Scene/Quests/Journal/Map). Rail computed `grid-auto-columns: minmax(max-content,1fr)`

- `overflow-x: auto` at coarse; `TabsTab` stacked arm carries sealed `min-w/min-h: 44px`.

| width | smallest cell w × h | all ≥44? | fits (scrollW==clientW)? |
| - | - | - | - |
| 430 | 66.5 × 49.1 (all six equal) | yes | equal columns, no scroll |
| 375 | 56.9 × 49.1 | yes | yes (374/374) |
| 320 | 45.3 × 49.1 (was 34 before) | yes | yes (319/319) |

- **Hit-test:** at 430, center `elementFromPoint` of all six cells resolves to that cell's own
  `<button>` — no shared-boundary ambiguity (real `gap-field` between cells).
- **Rendered:** `reports/snaps/rpg-rail-coarse-430.png` — solid equal six-column frame, glyph-over-
  caption, Status active (accent). No 127px dead rail. Admin rail below (Members/This chat/Preview/
  Game) also renders as a solid framed strip with the "CHAT" kicker + host crown on Game.

### ③ coarse game-rail keyboard focus ring not clipped — CONFIRMED

- Focused the active game tab, then a REAL `ArrowRight` keypress (roving tablist nav) to promote
  `:focus-visible` (`el.matches(':focus-visible') === true`).
- Focused Inventory cell computed `box-shadow: oklch(0.72 0.175 52) 0 0 0 2px inset` — a 2px INSET
  ring. UA `outline: none`. The list computes `overflow-x: auto` AND `overflow-y: auto` (49px cell in a
  50px box) — an offset `ring-offset-2` ring would paint into the clipped region; the inset ring paints
  fully inside the border box.
- **Rendered:** `reports/snaps/rpg-rail-focus-inset.png` — the orange inset ring is clearly visible
  inside the Inventory cell.

### ④ new-draft cold identity (no `? ? ? / New chat` flash) — CONFIRMED

- `requestAnimationFrame` recorder over `.shell-topbar-title` across a fresh 3-character draft created
  through the picker (warm `character.list`): recorder logged **2 distinct frames** —
  `"Chats"` (landing) → `"Aldric Vane, Kohaku, Sabine Veyra"` (resolved cast). **Zero** frames
  containing "New chat", **zero** with "?", **zero** `[data-slot=draft-cast-loading]` skeletons. The
  title resolved atomically, list-first. A \~2s "New chat" flash would have produced an intermediate
  distinct frame at \~60fps; none exists.
- **Rendered:** `reports/snaps/draft-after-create.png` — draft opens with the joined cast title and a
  populated Members context, no placeholder state.
- **Not covered:** only the warm-list (picker) path — which is the exact path the fix targets and the
  only real entry into a draft. Did not fabricate a cold-`character.list` case (not a user flow).

### ⑤ PTRGATE pointer-literal relocations — CONFIRMED (2 rendered, 4 source+CT)

`pointer-variants.ts` documents each const as the EXACT class it replaced; gate
`no-pointer-variants-in-features` + CTs pin the behavior.

- **RPG\_RAIL\_WRAP** — RENDERED: coarse rail is `minmax(max-content,1fr)` + `overflow-x:auto` (the ②
  measurements). Identical to the inline literal it replaced.
- **HIDE\_AT\_COARSE** — RENDERED: the `rpg-hud-echo` line ("GAME · STATUS") is absent at coarse in the
  430 screenshot; the band shows only the scene header. Correct drop.
- **CHIP\_TOUCH\_FLOOR\_AT\_COARSE, PICKER\_GAP\_AT\_COARSE, REVEAL\_AT\_COARSE, FINE\_INERT\_UNTIL\_HOVER** —
  source-verified byte-identical + CT-pinned; **not rendered**: no removable condition chip exists in
  either seed profile (d20 / richGame both show only the "+ condition" add button, no seeded
  conditions on the default subject), the item-icon picker lives behind a popover interaction, and the
  reveal/inert arms are fine-only hover classes. Low risk (relocation is textual), but flagged as
  unverified-rendered for honesty.

---

## Taste & flow verdict

- **Persona row (coarse):** clean. Crown + heart read clearly next to the name; the subtitle states
  the default in words. Nothing cramped. Fine.
- **RPG game rail (coarse):** reads as a proper phone tab-strip — solid equal columns, glyph-over-
  caption, unambiguous active state, comfortable 49px targets. This is the "solid frame" the ruling
  wanted; the old bunched-left dead rail is gone. One nit below.
- **Draft header:** resolves instantly to the cast; feels right, no jank, no placebo.

## Stumbled-on (out of scope — reported then returned to targets)

- **\[P3 taste] Map cell lock glyph dangles at the rail's top-right edge**, slightly outside the frame
  (`reports/snaps/rpg-rail-coarse-430.png`, top-right). Pre-existing phase-lock indicator, NOT from
  these fixes. Minor.
- **\[RETRACTION] "+ condition" button is 18.3px tall at coarse** — I nearly filed this as a sub-44
  tap target. Killed by its own receipt: it carries an `::after` hit expander (`position:absolute`,
  `height:44px`, negative insets) giving a ≥44px effective target. Not a defect; the floorless-glyph
  hit-expander pattern renders correctly.

## What's genuinely working (don't touch)

- The two-arm marker/heart display gating (`ROW_ACTION_INLINE`/`OVERFLOW`) — one element in the a11y
  tree per pointer class, verified both ways.
- The stacked-tab inset focus ring inside the overflow-auto rail — the right fix; visible and unclipped.
- List-first draft cast resolution — atomic title, no placeholder frame.

## Biggest opportunity

Rendered coverage for the four unproven PTRGATE carriers (condition chip ✕, item-icon picker gap)
needs a seed profile that populates a removable condition on the default subject, or a scripted
open-the-picker step — so the coarse touch-floor they carry is provable, not just source-asserted.
