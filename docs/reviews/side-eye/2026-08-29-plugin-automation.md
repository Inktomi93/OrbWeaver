---
kind: review
status: complete
updated: 2026-08-29
---

# side-eye — Plugin & Automation acceptance pass (2026-08-29)

Live dev app `:5173`, main `50bb91ed4`, single-user (authenticated, no login wall). Seeded 9 showcase
plugins, all installed-but-OFF. Driven READ-ONLY-ish: enabled oracle-deck / story-clocks /
pocket-arcade / card-atlas / keepsake-camera, granted card-atlas its capabilities, created one
"Living library" automation rule (all non-destructive on the disposable dev DB).

**Verdict: SHIP WITH FIXES.** The consent/onboarding writing and information design are genuinely
excellent — this is the strongest-written surface I've reviewed here. Every confirmed defect is
polish-tier (tap targets, one mobile collision, empty-state and a11y-name nits). Nothing blocks.

## Per-area verdicts

- **Area 1 — Plugins settings & consent (Settings → Plugins):** SHIP WITH FIXES. Consent copy,
  capability legibility, install flow, and the pending-reconsent state are excellent. Defects: a
  mobile row-header collision, cramped consent-checkbox / disclosure tap targets, a WCAG 2.5.3
  label-in-name miss, run-on SR names.
- **Area 1 — Extensions section (rail #679 plane) + Card Atlas flagship page:** SHIP WITH FIXES.
  The `ui.page` masterDetail hub browser renders cleanly with a good empty state. Defects: a
  contradictory double empty-state when zero pages exist, and a redundant "Card Atlas · Card Atlas"
  title. Could NOT drive the populated results grid (live external-hub fetch timed out — see coverage).
- **Area 2 — Automation (Settings → Automation):** SHIP. Clean at desktop and mobile, Lighthouse 100,
  design-audit 3×P3 only, no tap-target issues. Strong safety copy and empty-state guidance.

## Findings (ranked)

### P2 — Mobile plugin-row header collides: toggle overlaps the status badge + Update button

`Settings → Plugins → Installed`, ~390px. On the Draft Polish row the long status badge
"Off — asked for more than you allowed" collides with the toggle switch (white knob painted OVER
"…more th\[an]…") and the "Update" button box overlaps the badge. The Affinity Tracker row above (short
"Off" badge) fits fine — so the row header does not reflow when the badge string is long.

- Why it hurts: on a phone, the status of a security-consent row is occluded/garbled — exactly the
  place a user needs to read "asked for more than you allowed" clearly. Riley (long-string) breaks it.
- Fix: at narrow container widths wrap the header (name → badge on its own line, controls below) or
  truncate/stack the badge. `harden` + `adapt` the row header.
- Receipt: `reports/snaps/plug-mobile.png`.

### P2 — Consent-grant checkboxes are an 18×18px hit area (32×32 on mobile); the label isn't clickable

`Settings → Plugins`, the per-capability grant checkboxes. The clickable target is the
`SPAN.checkbox` itself: 18×18px desktop (`cursor:pointer`, `elementFromPoint` = the span), 32×32px
under coarse pointer — under the 44px recommendation, and the descriptive label text to its left is a
separate, non-clickable element.

- Why it hurts: these checkboxes GRANT CAPABILITIES (net access, model spend, message rewrite). A
  cramped, box-only target on a security decision invites mis-taps, and there's a lot of empty row to
  the left that does nothing.
- Fix: make the whole capability row the toggle target (wrap label+box in the control), and/or grow
  the box to a 44px hit area. `adapt`.
- Receipt: `snap --eval` hit-test (clickable = 18×18 SPAN.checkbox, cursor pointer); `design-audit --goto settings:plugins --mobile` → 23×P2 tap-target `32×32px`.

### P2 — Disclosure buttons ("What it's allowed to do" / "Recent activity") are 16px tall

`Settings → Plugins`, the two collapsible triggers on every installed-plugin row. Full width (~746px)
but only 16px tall — below the 24px fine-pointer floor AND still 16px (below the 32px hard floor)
under coarse pointer, i.e. they do NOT get an expanded touch hit area on mobile.

- Why it hurts: a 16px-tall strip is a vertical mis-tap risk on touch, on the surface where users
  inspect what a plugin can do / what it's done.
- Fix: give the collapsible triggers a ≥32px (ideally 44px) vertical hit area (padding/min-height).
  `polish` + `adapt`.
- Receipt: `snap --eval` (BUTTON, `cursor:pointer`, `h:16`, text "What it's allowed to do" /
  "Recent activity"); `design-audit --goto settings:plugins --mobile` → 18×P1 tap-target `316×16px`
  "below the 32px hard floor".

### P3 — WCAG 2.5.3 Label-in-Name: disclosure trigger visible text ≠ accessible name

The "What it's allowed to do" buttons carry `aria-label="What <Plugin> is allowed to do"` (e.g.
"What Affinity Tracker is allowed to do"), which does NOT contain the visible words "What it's allowed
to do".

- Why it hurts: a voice-control user saying "click what it's allowed to do" can't match the control
  (Sam). The per-plugin disambiguation is good for screen readers but should still contain the visible
  label.
- Fix: keep the visible words inside the accessible name (e.g. `aria-label="What it's allowed to do
  — Affinity Tracker"`). `clarify`.
- Receipt: Lighthouse a11y (desktop, snapshot on the plugins pane) — the ONE failed audit,
  `label-content-name-mismatch`, 3 nodes; `reports/lighthouse-plugins/report.json`.

### P3 — Grant-checkbox accessible names are run-on and redundant

The consent checkboxes are `aria-labelledby` a single element whose textContent is
`"Rewrite your outgoing messages (new in this update)NewReaches further"` — the badge pills ("New",
"Reaches further") are inside the label with no separator, and "(new in this update)" is repeated by
the adjacent "New" badge.

- Why it hurts: a screen-reader user hears the redundancy + run-on on every capability row (matches
  the `ListRow.markers` run-on-spoken-text lesson).
- Fix: drop the "New" badge from the accessible name (decorative), or separate the badge text; remove
  the "(new in this update)" / "New" redundancy. `clarify`.
- Receipt: `snap --eval` on the checkbox `aria-labelledby` composed text.

### P3 — Extensions section: contradictory double empty-state when there are zero pages

`Extensions` rail section with no page-surface plugins granted. The LIST pane says "No extension pages
yet / Install a plugin with page surfaces…" while the CONTENT pane simultaneously says "Pick an
extension page / Choose a page on the left to open it here / Browse extension pages" — but there is
nothing on the left to choose and nothing to browse.

- Why it hurts: the two panes give contradictory guidance; a first-timer is told to pick from an empty
  list. (Once a page exists, the CONTENT placeholder is correct — this is only the zero-pages case.)
- Fix: when the page list is empty, the CONTENT should mirror the LIST's "install a plugin" guidance,
  not "pick one on the left". `onboard`.
- Receipt: `reports/snaps/ext-section.png`.

### P3 — Redundant "Card Atlas · Card Atlas" title on the extension page

The Card Atlas page shows the plugin name twice — header reads "Card Atlas · Card Atlas" and the list
row shows "Card Atlas" title over a "Card Atlas" subtitle — because the page title equals the plugin
name.

- Why it hurts: reads as a placeholder/bug; wastes the title line.
- Fix: when page title == plugin name, show it once (or show the page's own name distinct from the
  plugin). `polish`.
- Receipt: `reports/snaps/atlas-page.png`.

## Observation for owner (not filed as a defect — consent-model design call)

Toggling a plugin ON while every capability reads "Not granted" leaves it enabled-but-inert (verified
on Oracle Deck: switch on, all 5 capabilities "Not granted", zero surfaces register). This is the
intended least-privilege posture, but "I turned it on and nothing happened" is a plausible user
reaction. Worth an owner decision on whether an enabled-with-nothing-granted plugin should nudge the
user toward the grant step. Receipt: `reports/snaps/oracle-perms.png`.

## ARIA / a11y recommendations

- Disclosure triggers: make the accessible name contain the visible label (P3 above).
- Grant checkboxes: extend the accessible click target to the whole capability row; de-run-on the
  accessible name (P3s above).
- Everything else navigates well: keyboard walk of the settings modal reaches Search → category
  buttons → pane controls with `:focus-visible` true at every stop; consent checkboxes and rule-row
  controls are keyboard-reachable; switches carry good names ("Turn Oracle Deck on", "Enable Living
  library"). Lighthouse a11y = 100 on both panes bar the one label-in-name miss.

## Taste & flow verdict (§13)

- **Plugins settings — looks good, reads great.** The consent writing is the standout: "A plugin is a
  .zip holding a manifest and one script. It runs sandboxed, and it can only do what you allow here.",
  "only in rooms you are already in.", the "Costs money" badge, "Turning a plugin on runs its code as
  that person, so nobody can do that step for them." A first-timer understands the security model cold.
  The pending-reconsent state ("Off — asked for more than you allowed. This update asks for 6
  permissions you hadn't allowed, so it stayed off.") is exactly right. Flow is intuitive. The only
  cramp is the far-right checkbox column being physically distant from its label text (wide scan gap)
  and small — covered above.
- **Add-a-plugin — excellent.** Dropzone + install-from-link + distribute, each with plain-language
  security framing. Clean.
- **Extensions / Card Atlas — clean, one confusing empty double-state.** The hub-browser page itself
  is well-composed (kicker "FIND A CHARACTER", a search with a nice "a name, a vibe, a fandom…"
  placeholder, "Search to begin — the atlas covers Character Tavern and RisuRealm.", an "EXTENSION"
  tag in the header so the user knows it's a plugin surface). The double empty-state and the doubled
  title are the only off notes.
- **Automation — clean and calm.** "These rules watch your library and act on their own — no chat has
  to be open.", the safety-limit copy, the empty-state with a concrete example, the two-step rule
  template popover, the created rule row ("Hasn't run yet", Test, off-by-default). No IA duplication
  spotted. Reflows well on mobile.
- **Shell IA:** the `extensions` rail section is the 10th (sanctioned #679 plugin plane, SECTION_IDS
  carries it) — NOT a rail-overflow finding; the shell anatomy is respected (finding in LIST, page in
  CONTENT, settings in the modal).

## What's genuinely working (don't touch)

1. The entire consent/permission writing + the pending-reconsent UX — best-in-repo copy; keep it.
2. Automation pane end-to-end (empty state → template popover → rule row → safety limit) — clean,
   calm, safe defaults; Lighthouse 100 / design-audit clean.
3. Keyboard operability + focus-visible across the settings modal, and contrast (all sampled text
   PASS: dialog body 7.56:1, badges "New" 15.34:1 / "Reaches further" 4.95:1, "asked for more…"
   6.64:1, automation muted 7.56:1).

## Biggest opportunity

Grow the two cramped touch surfaces on the consent screen (grant checkboxes + the 16px disclosure
strips) and make the label the target — a security-consent surface is the worst place for a mis-tap,
and it's the single class of defect that repeats across the Plugins pane.

## Coverage

- COVERED: Plugins settings (Installed / Add a plugin / consent + pending-reconsent), grant flow,
  Extensions section + Card Atlas `ui.page` render + empty state, Automation (Library-wide rules,
  rule template popover, rule creation, safety limit), desktop + mobile (390/430px), keyboard walk,
  contrast, design-audit (plugins desktop+mobile, automation), Lighthouse (plugins + automation,
  desktop snapshot).
- NOT REACHED: (1) The **populated Card Atlas results grid / preview / import** — the plugin-internal
  search input didn't accept a scripted fill and the live external-hub fetch (Character Tavern /
  RisuRealm) timed out at 10s; the showcase doc itself flags these hubs as slow/geo-restricted, so
  this is a live-network limitation, not a confirmed defect. Ghost-tile-for-unresolved-binding
  behavior (flagged in `plugin-showcase-set.md` §line 45) and the **message-footer "wallpaper" anchor**
  (`plugin-showcase-set.md` §6.2, self-flagged) both need a live chat turn + model to exercise and
  were out of reach here. (2) Chat-side plugin surfaces (snippet console, anchored surfaces, tool
  cards) require an active chat turn / model invocation — not driven.
- Lighthouse mobile snapshot: not separately run (a11y rules are viewport-independent; the coarse-
  pointer tap-target read came from `design-audit --mobile`).

## Instrument coverage table

| Instrument | Status |
| - | - |
| `snap --map` (plugins/extensions/automation/rule editor) | RAN — reports/snaps/\*, logs in scratch |
| `snap --contrast` (badges, body, muted) | RAN — all PASS; "Costs money" off-screen NO-VERDICT |
| `snap --eval` (tap hit-tests, aria names, query cache, switch states) | RAN |
| `snap` screenshots (desktop + mobile) | RAN — plug-pane, oracle-perms, oracle-granted, add-plugin, ext-*, atlas-page/search, autom-*, rule-\*, plug-mobile, autom-mobile |
| Keyboard walk (`--key Tab` + focus eval) | RAN — focus-visible true at every stop |
| `design-audit --goto settings:plugins` (desktop + `--mobile`) | RAN — reports/design-audit/ |
| `design-audit --goto settings:automation` | RAN — 3×P3 only |
| Lighthouse desktop snapshot (plugins + automation) | RAN — reports/lighthouse-plugins/, reports/lighthouse-automation/ |
| Lighthouse mobile | SKIPPED — coarse-pointer read taken via design-audit --mobile; a11y rules viewport-independent |
| `motion-audit` / `perf-meter` | SKIPPED — no meaningful animation/interaction perf surface under review (modal panes; boot LoAF is the shell's, not these panes) |
| `__orb.motion()` CLS | Observed via snap console (0.0221, virtualized 0) — home shell, not the panes |
| Console triage | RAN — 0 console-errors / 0 page-errors across all runs; warnings are boot LoAF/drop on the shell logo animation (not these surfaces) |

## Resolution (2026-08-29, post-landing — orchestrator pass, lane cb-plugins-polish receipts)

Every finding above landed; the doc is `status: complete`. Live-verified on an isolated stage at
430px-coarse and 1440px by lane cb-plugins-polish (#796, verify evidence on the issue):

| Finding | Landed in | Receipt |
| - | - | - |
| P2 mobile header collision | `5e2d6b2e5` | `plugin-row.tsx:142-161` (`@max-md:flex-col` header, `flex-wrap` name row); CT `plugins-settings-surface.ct.tsx` "LONG status badge never collides" |
| P2 grant checkbox 18px / label not clickable | `5e2d6b2e5` | `plugin-grant-list.tsx` `<label htmlFor>`; drive receipt: clicking the consequence text flips `aria-checked`; CT "clicking a capability's CONSEQUENCE text toggles its grant" (`6a9402e94`) |
| P2 16px disclosures | `5e2d6b2e5` | `<CollapsibleTrigger size="control">` — 44px coarse / 32px fine |
| P3 label-in-name | `5e2d6b2e5` | names read "What it's allowed to do — <Plugin>" / "Recent activity for <Plugin>" |
| P3 run-on grant names | **`6a9402e94`** — the `5e2d6b2e5` fix was INERT (Base UI's generated `aria-labelledby` outranked its `aria-label`; `ariaSnapshot()` showed the whole label subtree); fixed with an explicit `aria-labelledby` = label + New mark, pinned `exact: true` | memory `aria-label-attribute-is-not-the-accname` |
| P3 Extensions double empty-state | `5e2d6b2e5` | `extensions-page-surface.tsx:64-82` mirrors `EXTENSIONS_EMPTY_*`; CT `extensions-section.ct.tsx:146` |
| P3 doubled "Card Atlas · Card Atlas" | `5e2d6b2e5` | `plugin-surface-shell.tsx:54` `showTitle = title !== pluginName`; CT `:84,160` |
| Owner observation (enabled-but-inert) | pre-empted by `a4b008957`-era work | badge "On — nothing granted yet", CT-pinned |

Still owed elsewhere: `design-audit --mobile` on the pane once #797 (the lying tap-target check)
lands — the label-content-name class is covered by the `exact: true` accname pin meanwhile.
