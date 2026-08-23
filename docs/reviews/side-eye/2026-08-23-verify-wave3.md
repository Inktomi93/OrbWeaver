---
kind: review
status: active
updated: 2026-08-23
---

# side-eye verification — lane se-verify-2 (2026-08-23)

> Verification pass over the merged wave-3 fix set (#511 · #517 · #518 · #519 · #520 · #521 · #522 ·
> #523 · #525 + the earlier #501/#502/#513), driven live on `:5173`.
> Verdict: **SHIP WITH FIXES** — 11 of the 12 briefed items CONFIRMED with receipts; item 12
> (10 Succeeded corpus-analysis workload rows) is **REFUTED**; item 2's axe rule **FIRES** and the
> owner decision that hangs on it needs the exact shape of that firing, below.
>
> **Read the fixture caveat first (F1).** The database this lane drove is NOT the one the wave-3 fix
> lane measured against.

## F1 — FIXTURE DIVERGENCE (read before trusting any scale-dependent verdict)

The brief's premises — "search Emily, all colliding Emilys", "129 of 896", "10 Succeeded rows" — do
not exist on `:5173`. Measured, as the owner principal (`sessions.me` →
`{userId: 01m0pr9cqae03ae3e0k43k45ed, handle: inktomi93@gmail.com, globalRole: owner}` — so this is
NOT a wrong-principal empty read):

| Brief assumed | Actually on :5173 | Receipt |
| - | - | - |
| duplicate `Emily` ×3 (`emily`/`emily-2`/`emily-3`), `Hikari`×2, `Eva`×2, 13 rows | **10 characters, every name unique, no Emily** | band census `10`; `--map` of `aside[aria-label="Characters list"]` lists all 10 |
| 896 chats | **6 chats** | band census `6`; `role=list[name="Chats"]` holds 6 rows |
| 10 Succeeded corpus-analysis workload rows | **1 run total** (`Refresh model catalog · Bulk · Succeeded`) | Settings→Runs, `role=tabpanel[name="All"]` innerText |

`641e70533`'s own commit body cites the 13-row / 8-qualified / three-Emily library as its measurement
basis. Two of those rows (`Charlotte @assistant`, `JFC @jfc-coder`) ARE here — so this is the same
library lineage, shrunk. Either the DB was reset/replaced since the fix lane measured, or the fix
lane measured a stage. **Every verdict below was therefore taken at a scale 100× smaller than the fix
was built against**, and the scale-sensitive claims (virtualized paging behaviour of the census, the
`129 of 896` datum, tag-vocabulary overflow at real vocabulary size) are confirmed in FORM but not at
scale. That is stated per item.

**Seeded fixture — I created two rows and left them in place.** To test #517 at all I had to
manufacture a name collision. They are:

- `Emily` @ `emily` — description `side-eye se-verify-2 seed row for #517 collision verification`
- `Emily` @ `emily-two` — created as `Emily Two`, then renamed to `Emily` in the editor

They are LEFT ON THE TREE deliberately: they are the only reproduction of the #517 condition on this
database, so deleting them would delete the evidence. Delete both when the collision case is no
longer needed.

---

## Verdicts — one line per briefed item

| # | Item | Verdict |
| - | - | - |
| 1 | #517 row qualifier spent on ambiguity | **CONFIRMED** (after seeding a collision) |
| 2 | #517/#512 axe `label-content-name-mismatch` | **FIRES — 10 items.** See §2, load-bearing |
| 3 | #518 one visible census in the pane column | **CONFIRMED** |
| 4 | #519 filters disclosure advertises contents | **CONFIRMED** |
| 5 | #520 exactly one "New" on the plane | **CONFIRMED** |
| 6 | #523 tag-vocabulary viewport is a named region | **CONFIRMED** (+ keyboard receipt) |
| 7 | #501/#502/#513 character selection / Chats tab / overview card | **CONFIRMED**, all five clauses |
| 8 | #521 overflow tile distinct silhouette | **CONFIRMED** |
| 9 | #522 empty month input in the muted tone | **CONFIRMED** (pixel receipt; see the retraction) |
| 10 | #525 census case, inset clears, no width jump | **CONFIRMED** in form; not at the 896 scale |
| 11 | #511 phone cast strip is one 40px avatar row | **CONFIRMED**, both pointer arms |
| 12 | 10 Succeeded corpus-analysis workload rows | **REFUTED** — 1 run under the "All" lens |

---

## 1 — #517 the qualifier is spent on ambiguity · CONFIRMED

The library as shipped has no collisions, so the positive half was unverifiable until I seeded one.
With `Emily @emily` and `Emily @emily-two` both present:

```
{ accname: "Emily · emily-two",  titleSlot: "Emily",  allVisible: "E | Emily | · emily-two | emily-two" }
{ accname: "Emily · emily",      titleSlot: "Emily",  allVisible: "E | Emily | · emily | emily" }
{ accname: "Elias Thorn",        titleSlot: "Elias Thorn",  allVisible: "Elias Thorn | elias" }
{ accname: "JFC",                titleSlot: "JFC",          allVisible: "JFC | jfc-coder" }
{ accname: "Charlotte",          titleSlot: "Charlotte",    allVisible: "Charlotte | assistant" }
```

- Colliding rows carry a VISIBLE `data-slot="list-row-title-qualifier"` in the title line.
- The one whose handle IS the plain slugified name (`emily`) is qualified — the old derivability gate
  is gone. That is the whole point of #517 and it lands.
- Unique-named rows with odd handles (`JFC @jfc-coder`, `Charlotte @assistant`) carry NO qualifier.
- Visible title text `"Emily" + "· emily-two"` == accessible name `"Emily · emily-two"`,
  character-for-character.
- The row's satellite controls inherit it: `Star "Emily" · emily-two`, `Chat with "Emily" · emily-two`,
  `Actions for "Emily" · emily-two`.

Receipts: `reports/snaps/se2-collision-rows.png`, the eval above, `--contrast
[data-slot=list-row-title-qualifier]` → **8.66:1 PASS** (13px, need 4.5).

## 2 — the axe receipt (LOAD-BEARING) · the rule FIRES

**Instrument: Lighthouse 13.4.1 (axe-core), `mode: "snapshot"`, `device: "desktop"`, run through the
chrome-devtools MCP `lighthouse_audit` against the LIVE characters library with both `Emily` rows on
screen** (pre-flight `__orb.nav.section('characters')` confirmed the eight Emily-bearing accnames were
in the DOM before the audit ran). Report: `reports/lighthouse-se2/report.json` / `.html`.

```
Accessibility category score: 100
audit "label-content-name-mismatch": score 0 · scoreDisplayMode "binary" · 10 items
  weight in category: 0   group: "hidden"
```

**The 100 is not a clean bill on this rule.** Lighthouse carries
`label-content-name-mismatch` at weight 0 in the hidden group, so a hard failure of it cannot move the
category number. It ran (it is not in the 42 `notApplicable` audits) and it failed on 10 of 10
rendered rows.

What it flagged, and this is the part the decision turns on — **it flagged EVERY row, not just the
qualified ones**:

```
aria-label="Emily · emily-two"                       — "Text inside the element is not included in the accessible name"
aria-label="Emily · emily"                           — same
aria-label="Elias Thorn"                             — same
aria-label="Calamity, Doomblade of the Ninth Epoch"  — same
aria-label="Kohaku" / "Birdie Mae Holloway" / "Sabine Veyra" /
"Morgatha, the Undying Dark" / "Hana Mizushima" / "Niko"  — same
selector: div.relative > div.absolute > div.@container/list-row > button.group
```

**Cause: the SUBTITLE, not the qualifier.** Every row button contains
`data-slot="list-row-subtitle"` (the handle rung — `elias`, `jfc-coder`, `assistant`) inside the
button, and that text is not in the `aria-label`. It is wired as `aria-describedby="…-subtitle"`, but
`describedby` feeds the DESCRIPTION, never the NAME, so axe's speech-input rule still fails.

Consequences for the owner decision:
- #517's qualifier **neither caused nor cured** this. On qualified rows the title-line text is now
  fully contained in the accname (a strict improvement); the residual mismatch is the subtitle, which
  predates the fix and is identical on unqualified rows.
- The only way to zero this rule with the current row anatomy is to fold the subtitle into the
  accessible name (`aria-label="Elias Thorn · elias"` for every row) — which is exactly the
  derivability-era behaviour #517 deliberately killed, or to move the subtitle out of the button.
- Also confirmed clean and RUNNING beside it: `button-name` 1, `label` 1, `color-contrast` 1,
  `aria-*` family 1, `target-size` 1, `landmark-one-main` 1.

## 3 — #518 one visible census · CONFIRMED

| State | Visible in the band | sr-only `role="status"` | FILTERS group |
| - | - | - | - |
| unfiltered | `10` (one `SPAN`, 10.5px, `text-transform: none`) | `10 characters` (1×1) | no census line |
| search narrows | `8 of 10` (50×13px) | `8 characters` (1×1) | no census line |
| no matches | `0 of 10` | `0 characters` | no census line |

Exactly one visible census element in the pane column in every state; the old FILTERS-group line is
gone visually and survives as a mounted 1×1 `role="status"` live region. Not verified at paging scale
(10 rows never paginates).

## 4 — #519 disclosure advertises its contents · CONFIRMED

Collapsed: accname `"Favorites, archived & tags — show more filters"`, visible text
`"Favorites, archived & tags"`. Expanded, it flips to `"Fewer filters — hide the tag vocabulary"`.
No "More filters" string anywhere on the surface.

## 5 — #520 one "New" on the plane · CONFIRMED

- **Docked**: exactly one rendered New, in the list band at `x=277, y=8`. The CONTENT hero has none.
- **Collapsed** (`[aria-label="Hide list panel"]`): the hero's New appears at `x=631, y=488`, and the
  band's New is `inert: true`, `aria-hidden: "true"`, `transform: matrix(1,0,0,1,-363.188,0)`,
  `rect.x = -307.19` — off-canvas AND out of the a11y tree, so a screen-reader user does not hear two.
- The collapsed hero's copy names the exact recovery control: *"The list isn't on screen right now —
  Show list panel in the top bar brings it back."* and the topbar control's accname is literally
  `Show list panel`. Good Nielsen-4 consistency.

Receipt: `reports/snaps/se2-list-collapsed.png`.

## 6 — #523 tag vocabulary is a named region · CONFIRMED

```
{ tag:"DIV", role:"region", label:"Tag vocabulary", tabindex:"0",
  slot:"scroll-area-viewport", clientHeight:192, scrollHeight:284 }
```

Plus a live keyboard walk (`--key Tab` chain, focus read at every stop):

```
BUTTON | Fewer filters — hide the tag vocabulary | fv=true
INPUT  | Filter tags                             | fv=true
BUTTON | Show fewer tags                         | fv=true
DIV    | Tag vocabulary                          | fv=true   ← the region is a real Tab stop
BUTTON | Filter by comedy: off — activate to include | fv=true
BUTTON | Emily · emily-two                       | fv=true
```

The overflowing scroller is reachable and scrollable by keyboard with a visible focus ring. Note the
tag chips use a roving tabindex (one stop for the whole group) — correct, not a finding.

## 7 — #501/#502/#513 · CONFIRMED, all five clauses

1. **Selecting a character keeps the library docked** — after `--open-character 'Sabine Veyra'`:
   `asides = [{label:"Characters list", x:56, w:307, inert:false}, {label:"Characters details", x:1280, inert:true}]`,
   `listPaneRows: 40` (the library `role=list` still holding all rows). The list pane never swaps to chats.
2. **Her chats are a CONTEXT tab named "Chats"** — `[role=tab]` = `Field · Chats · Links · Options`.
3. **The hero's "N chats ›" opens that tab** — clicking `1 chat` in main flips the context panel open
   AND sets `Chats` to `aria-selected: "true"`, with her thread (`Example — The Ashen Spire`) listed.
4. **The overview card groups are Origin/Links/Options/Activity and echo neither Tokens nor Tags** —
   context innerText: `ORIGIN (Added / Source) · LINKS (World books / Personas) · OPTIONS (HTML /
   External media) · ACTIVITY (Last chat)`. `1257 total · 1017 permanent` and the tag row live in the
   hero only.
5. **Empty facets read "Empty"** — `World books → Empty`, `Personas → Empty`; the hero's tag area reads
   `Empty` with `+ Add tag` as a separate control beside it, never as a value.

Receipt: `reports/snaps/se2-char-context.png`.

## 8 — #521 overflow tile silhouette · CONFIRMED

The overflow tile's inner element:
`class="flex flex-row items-center justify-center size-avatar-md rounded-full border border-border border-dashed"`
— a **dashed circular ring**, transparent fill, `+7` label above the caption `More`. Its neighbours are
filled rounded-square portraits. Distinct at a glance.
Receipt: `reports/snaps/se2-facepile.png`.

## 9 — #522 empty month input tone · CONFIRMED (with a retraction)

**RETRACTION — my own first read was wrong.** `getComputedStyle(monthInput, "::-webkit-datetime-edit")`
and every sibling `::-webkit-datetime-edit-*` pseudo returned `oklch(0.955 0.004 75)` — the full-strength
foreground — which read as a clean REFUTE. It is not a receipt: `getComputedStyle` on a WebKit UA-shadow
pseudo returns the ORIGINATING element's resolved style, not the pseudo's paint. Killed by the
framebuffer.

Pixel receipt (element shots decoded via `sharp`, brightest-cluster modes):

```
token --color-muted-foreground  oklch(0.74 0.008 65)  → sRGB 174,170,166  (L=170.6)
token foreground                oklch(0.955 0.004 75) → sRGB 242,240,237  (L=240.2)

se2-month-field.png   dominant text pixel: 174,170,166  (L=170.6)  ×29
se2-search-field.png  dominant text pixel: 174,170,166  (L=170.6)  ×31
```

The `-------- ----` interior paints in the **identical** dominant pixel as the `Search chats…`
placeholder. It visually matches — see `reports/snaps/se2-month-field.png`. (The 20 pure-white pixels
in the month shot are the native calendar-picker glyph, not the placeholder; see N5.)

## 10 — #525 census, inset clears, no width jump · CONFIRMED (in form)

- **Census reads name-then-number, lowercase, spaced.** `innerHTML` is literally `6 of 6` / `0 of 6`;
  `text-transform: none`, `font-variant: normal`. Not `6 OF 6`, not run together. Verified at 6 chats;
  the `129 of 896` datum could not be reproduced at this scale.
- **Both clears sit inside their field bounds.** Search field spans `x 64 → 354.19`; `Clear the search`
  spans `322.19 → 354.19`. Month field spans the same `64 → 354.19`; `Clear the month` spans
  `322.19 → 354.19`. Neither overhangs.
- **No width jump.** Search field width `290.1875` before typing and `290.1875` with the ✕ rendered,
  to the sub-pixel. Month field likewise `290.1875` with a value + clear present.
- **No text runs under the ✕**: `padding-right: 32px` on the search input exactly reserves the 32px
  clear box.

Receipt: `reports/snaps/se2-chats-clears.png`.

## 11 — #511 phone cast strip · CONFIRMED, both arms

| Arm | pointer | viewport | Cast region | chips | names |
| - | - | - | - | - | - |
| `--mobile` | **coarse** | 430 | `h = 40px`, one row | `24×24` avatars | **sr-only** — `w=1,h=1, clip-path` set, `visibility: visible` |
| `--desktop` | fine | 1280 | `h = 40px` | `110px` / `280px` wide | rendered — `w=78/248, h=16, clip=false` |

So on a phone the strip is exactly one ~40px row of faces with the names preserved for assistive tech
and absent visually; at desktop width the same chips render their names. Receipt:
`reports/snaps/se2-cast-mobile.png` / `se2-cast-desktop.png`.

Reading-surface check on the same mobile room (this is the app's highest-risk text-over-art surface):
`[data-slot=message-bubble]` computes `background-color: oklch(0.255 0.006 60)` — **fully opaque, no
`backdrop-filter`, no background-image** — and `--contrast '[data-slot=message-bubble] p'` returns
**15.81:1 PASS** (15px, need 4.5). The art never reaches the prose. Clean.

## 12 — corpus-analysis workloads · REFUTED

Settings → Runs, with the `All` tab already selected (`role=tabpanel[name="All"]`), lists exactly ONE
row: `Refresh model catalog · 10m ago · Bulk · Succeeded · 422 models · 4 via Agent SDK`. There are no
corpus/character-analysis rows at all, let alone 10 Succeeded. Consistent with F1 (a different or reset
database). Receipt: `reports/snaps/se2-workloads.png`.

---

## New findings

### [P2] N1 — a duplicate-name create is refused with a generic toast; the server's actual reason is discarded

Creating a second character named `Emily` fails. The server answers with a precise, actionable reason;
the UI throws it away:

```
server → 400  {"message":"a character with handle \"emily\" already exists",
               "data":{"code":"BAD_REQUEST","reason":"handle_conflict"}}
UI     → toast "Couldn't create the character."   (dialog stays open, fields retained, no inline error on Name)
```

**Why it hurts:** the user is told only that it failed. Nothing on the Name field, nothing naming the
conflict, no suggested handle. The user's only recovery is to guess. Nielsen 9 (error recovery: state
the problem AND the fix, near the source) and §5 (error states are plain-language, near the source).

**Fix:** surface `reason: "handle_conflict"` as an inline error on the Name field — *"Emily already
exists. Try a different name, or open the existing one."* — with the existing row as a link.

**Receipt:** captured by hooking `window.fetch` before the click and reading the cloned response;
`reports/snaps/se2-dup-create.png` shows the retained dialog + the single generic toast.

**The structural half of this, which matters more for #517:** `character.create` derives the handle
from the name and does NOT suffix on conflict, so **the create flow cannot produce a name collision at
all**. The `emily`/`emily-2`/`emily-3` library that #517 exists to serve is reachable only by import or
by renaming after creation (which is how I built the fixture: create `Emily Two` → rename to `Emily`,
handle stays `emily-two`). Worth deciding whether that asymmetry is intended: create refuses, rename
permits.

### [P2] N2 — a colliding row prints the handle TWICE

On every qualified row the same datum lands in two slots:

```
data-slot="list-row-title-qualifier"  "· emily-two"  13px   font-mono  text-muted-foreground  (right-flush)
data-slot="list-row-subtitle"         "emily-two"    10.5px            text-muted-foreground  (left, under the name)
```

The subtitle ladder's last rung is the handle (`elevatorPitch ?? tagLine ?? handle`), and any character
without a pitch or a tag — i.e. everything freshly created, and per the fix's own note every orphan
import — lands on that rung. So exactly the rows that need the qualifier are the rows whose subtitle is
already the handle. §13 IA single-homing: one concept, two homes, in a 40px row.

**Fix:** when `nameIsAmbiguous` spends the handle in the title, drop the handle rung from the subtitle
ladder for that row (fall through to the next rung, or render nothing).

**Receipt:** the computed dump above; `reports/snaps/se2-collision-rows.png` shows `· emily-two` top-right
and `emily-two` bottom-left on the same row.

### [P3] N3 — the qualifier is visually detached from the name it qualifies

`list-row-title-qualifier` is `shrink-0` and flush to the right edge of a 307px row, while the name sits
at the left. The character-for-character equality with the accname is real, but a sighted user reads
`Emily ················ · emily-two` — a right-hand metadata column, not a qualifier of the name.
Speech-input users get the win; sighted disambiguation is weaker than the text equality suggests.

**Fix (§15 `layout`)**: `layout: the character list-row title line — set the qualifier immediately after
the title with the title truncating first — receipt: before/after `--shot-of` at the 307px mount and the
existing accname equality assertion still green.`

### [P3] N4 — the chats empty state offers to clear only ONE of the two active filters

With both a search term and a month filter active, the empty state reads *"No chat by August 2026
matches "…"."* and offers a single button: **Clear search**. The month constraint — named in the very
sentence above the button — has no recovery affordance there. Nielsen 3 (user control: back to safety).

**Fix:** offer `Clear all filters` when more than one constraint is active, or a chip per active
constraint. **Receipt:** `reports/snaps/se2-chats-clears.png`.

### [P3] N5 — the month field's native picker glyph outshouts its own placeholder

In the empty month field the `-------- ----` renders at `rgb(174,170,166)` (correct per #522) while the
native calendar-picker indicator renders at `rgb(255,255,255)` — the brightest pixel in the field. The
field's decoration is louder than the field's label. With a value set, that glyph and the custom `✕`
also crowd the same right-hand 60px. **Receipt:** `reports/snaps/se2-month-field.png`,
`se2-chats-clears.png`.

### [P3] N6 — `label-content-name-mismatch` is a standing, pre-#517 condition on every list row

Filed separately from item 2 because the decision is generic, not character-specific: any `@orb/ui`
list row that puts a subtitle INSIDE the row button and names the button with a title-only `aria-label`
fails this axe rule. It is currently invisible in every Lighthouse score we take (weight 0, group
"hidden"). If we care about speech-input users, this is one primitive-level decision
(`packages/ui/src/primitives/list-row/`), not ten feature-level ones.

---

## ARIA-navigability

Nothing broken found this pass; recording what was verified so the next lane does not re-derive it.

- Row buttons carry an explicit accname and, when ambiguous, a unique one — voice control can now
  address `Emily · emily-two` distinctly. The satellite controls inherit the qualifier.
- The collapsed list pane is `inert` + `aria-hidden` — no phantom duplicate "New" in the a11y tree.
- The pane census is a mounted, always-present `role="status"` live region (`10 characters` →
  `8 characters`), so the narrowing is announced without a visible second census.
- The tag-vocabulary scroller is `role="region"` + `aria-label="Tag vocabulary"` + `tabindex="0"` and
  takes a real Tab stop with `:focus-visible` true.
- Mobile cast chips keep their names sr-only (1×1 + clip-path) — the visual reduction costs nothing to
  a screen reader. Note the chips are non-interactive `DIV`s inside a `role="group"` and the
  `Members — 4` button is `display: none` at 430px; the room header's panel toggle remains the mobile
  door to the roster (visible in `se2-cast-mobile.png`), so this is a reduction, not a dead end.
- The ONE outstanding recommendation is N6: decide, at the `list-row` primitive, whether the subtitle
  belongs in the accessible name.

## Taste & flow verdict

**The characters list pane looks good.** Dense but not cramped — 52px rows, portrait + name + handle,
consistent left rail of avatars, one accent (the selected row's ember left-border and tint). Nothing
fights for attention; the FILTERS/VIEW micro-labels read as structure rather than clutter. The
collision rows are the one place the eye stumbles, and N2/N3 say why: the same handle twice, once
right-flush where the eye does not associate it with the name.

**The character detail surface flows right.** LIST finds, CONTENT does (the editor), CONTEXT configures
(Origin/Links/Options/Activity) — textbook §14, and the fact that selecting a character no longer swaps
the list out to chats is the single biggest improvement in this wave: the geography stops moving under
you. The `1 chat ›` → Chats-tab jump is exactly the right size of gesture.

**The hero has too many chat doors.** On one character screen: `New chat` (primary), `1 chat ›`,
`All chats→`, `Go to Chats`, `Start a temp chat`. Five affordances, at least three of which are the
same idea at different scopes, and a first-timer cannot tell `All chats→` from `Go to Chats` from the
screenshot alone. §13 IA: the concept "her chats" has more than one home in a single viewport.
Worth a `distill:` pass on that hero.

**The collapsed-list empty state is honest but enormous.** A 1224×740 plane of background for a
three-line message and one button. The copy is genuinely good (it names the exact control that brings
the list back). But at this size the void reads as "nothing loaded" rather than "nothing selected" —
the §14 law wants a *designed* landing state, and this is a centred paragraph. Not a wave-3 regression;
filing as taste.

**The chats band is tight and correct.** The face-pile → search → month stack scans top-down, the
census sits with the section name, the clears are inset and stable. The one wobble is the label
asymmetry: the month field carries a visible `Show chats from` label, the search field carries none
(placeholder only). Minor.

**Mobile chat room: no complaints on the reading surface.** Opaque bubble, 15.81:1, art confined to the
margins. The chrome budget is heavy though — header 48 + cast 40 + composer ~190 + tab bar ~60 = ~340
of an 800px viewport (~42%) before a word of transcript. That is a real one-handed-reading cost, and
it is not a wave-3 item.

## What's genuinely working (do not touch)

1. **The `inert` + `aria-hidden` treatment of the collapsed list pane.** It is the reason #520 is a
   true single-home fix rather than a visual one — the duplicate is gone from the a11y tree too.
2. **The census single-homing (#518).** Visible datum in the band, live-region duplicate for assistive
   tech, nothing in the FILTERS group. That is the correct shape and it is implemented exactly.
3. **The mobile cast reduction (#511).** Dropping the names visually while keeping them sr-only is the
   right trade, done the right way (clip-path, not `display:none`).

## The single biggest opportunity

**Decide the row's accessible-name contract once, at the `list-row` primitive.** Item 2's axe failure,
N2's double-printed handle and N3's detached qualifier are three faces of one unresolved question: does
the subtitle belong to the row's NAME or to its DESCRIPTION? Answer it in
`packages/ui/src/primitives/list-row/` and all three collapse — every list surface in the app inherits
the answer, and the next Lighthouse pass gets a receipt instead of a hidden zero.

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `pnpm snap --map / --aria / --contrast / --eval / --expect` | **RAN** — ~20 invocations; contrast receipts inline; maps of the characters pane, chats pane, workloads dialog, new-character dialog |
| 2 | `pnpm design-audit <route>` desktop | **RAN** — characters `findings=1 p3=1` (`flat-type-hierarchy`, whole-page ramp, pre-existing); chats `findings=1 p3=1` (same rule) → `reports/design-audit/root.json` |
| 2b | `pnpm design-audit --mobile` | **RAN** — characters, `pointer=coarse`, `findings=1 p3=1` (same standing rule). No tap-target or aria-name findings in either arm |
| 3 | `pnpm motion-audit` | **SKIPPED** — brief instructed to avoid heavy traces under load; no motion-class item in the wave-3 set |
| 4 | `pnpm perf-meter` | **SKIPPED** — same reason; no responsiveness item briefed |
| 5 | Lighthouse (`lighthouse_audit`, MCP) | **RAN** — desktop/snapshot, `reports/lighthouse-se2/` (item 2's whole deliverable). Mobile arm **SKIPPED** — the briefed question was one desktop rule on the characters library; no overlay-rooted findings (all 10 items resolve to `button.group` list rows, not the vite-checker HUD) |
| 6 | `__orb` suite (`.motion()`, `.renders()`, `.perf()`) | **SKIPPED** — no motion/churn item briefed; load explicitly moderate |
| 7 | Console triage | **RAN** — 0 errors, 0 page errors, 0 failed requests on every clean run. Warnings are the boot `[frame]`/`[drop]`/`[cls 0.0226]` set, identical across all runs and independent of the wave-3 surfaces (route `/` boot, `weave-veil` + `svg[aria-label=Orbweaver]`); the only deliberate 400 is N1's reproduction |
| 8 | The PNGs, actually read | **RAN** — `se2-char-context`, `se2-collision-rows`, `se2-list-collapsed`, `se2-chats-clears`, `se2-facepile`, `se2-month-field`, `se2-cast-mobile`, `se2-dup-create` |
| 9 | Keyboard walk (`--key Tab` + focus reads) | **RAN** — 8-stop walk through the expanded filters into the library; `fv=true` at every stop (§6) |
| 10 | Appearance-preset arms | **SKIPPED** — no wave-3 item is density/typography-conditional; the owner-default arm is the one every briefed claim was made against. Flagged as a gap if #518's census or #517's qualifier is re-reviewed under `compact`/`reading` |
| 10b | Theme arms (`--theme`) | **SKIPPED** — no light-sensitive finding this pass; both colour claims (#522, contrast) rest on token-identity/pixel receipts, not on polarity |
| 11 | Pane-state arms | **RAN (partial)** — list docked + list collapsed (#520's whole point) and context hidden + context open (#501/#513) at desktop; the both-hidden and mobile-pane matrices **SKIPPED** — not implicated by any briefed item |
| 12 | Framebuffer pixel sampling (`sharp`) | **RAN** — #522's verdict and the retraction that produced it |
