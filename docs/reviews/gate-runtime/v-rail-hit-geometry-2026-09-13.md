---
kind: review
status: active
updated: 2026-09-13
---

# RAIL hit-geometry rendered consequence review — 2026-09-13

**VERDICT: SHIP.** The #2300/#2301 scorer repair survives a two-direction live control across every canonical RAIL section and exposes one real P2 tap-target product defect. The broader audit also stumbled over one real P1 accessibility defect in Extensions: its programmatic arrival-focus target is unnamed. File both as product follow-ups; neither weakens the evidence for shipping the hit-geometry instrument repair.

## Scope and provenance

This is a focused review of coarse-pointer tap geometry, not a full design audit. The route roster comes from the canonical ordered tuple in `packages/client/src/state/section-ids.ts:5-18`: Home, Chats, Characters, Corpus, Settings (`config`), Extensions, Databank, Presets, Refinery, Analytics. I did not guess routes from labels or screenshots.

The shared stack was down and was not started or changed. Root authorized a single isolated Snap stage. Every browser run states:

- rendered ref: `06ebd729859f55e90afbf5591f6fcbc3ec260909`
- stage worktree: `.cache/snap-stage/06ebd729859f`
- band 0, Vite `http://localhost:5273`, API `:8888`
- disposable stage database; no chat sends, user-record edits, or product mutations
- actual device: iPhone 14 Pro Max emulation, `430x740`, DPR 3, `pointer: coarse`, touch enabled

The `RUN ... checkout=main sha=...` field changed as root landed tooling/docs commits. That field identifies the calling tool checkout. The rendered product provenance remained pinned to the exact ref above in every `PROVENANCE` line.

## Focused target verdict

**RAIL tap-target remeasurement: SHIP.** Across ten independent mobile runs, the tap family reached and judged 225/225 candidates with `extentTruncated=0`, `cap=0`, `ruledSubFloor=0`, and `sameOwner=0`. Ten candidates were the deliberately planted positive control, leaving 215 product controls. The planted 20x20 button fired on every route. After subtracting it, 214/215 product controls passed and one Settings control failed. This is not a zero-findings inference.

Home and Characters have whole-run `population-verdict=NO-VERDICT` for unrelated families: Home withheld two masked foregrounds from three color families; Characters withheld one unmatched unselected selection-idiom member. Their tap populations are independently complete at 37/37 and 38/38, respectively. I make no whole-surface clean claim from those runs.

## Confirmed findings

### \[P1] Extensions moves arrival focus to an unnamed generic wrapper

**What.** `ExtensionsSwitcherSurface` calls `useFocusOnMount(surfaceRef)` and puts that ref on `<Container tabIndex={-1}>` without a role or accessible name. On a real section navigation, that wrapper is the element focus moves to. The child `button "Card Atlas"` is correctly named, but a descendant's name does not name the focused wrapper.

**Why it hurts.** A screen-reader user entering Extensions can be moved to a generic node that announces no section or region identity. They learn where they landed only after moving focus again.

**Fix.** `clarify: the Extensions arrival-focus target — give the focused container the appropriate region role and a stable "Extensions list" accessible name, following the Presets list precedent.` Preserve the existing child row name and focus behavior.

**Owner/source.** `packages/client/src/features/plugin/surfaces/extensions-switcher-surface.tsx:92-95`. The direct precedent is `packages/client/src/features/preset/surfaces/preset-library-surface.tsx:55-60`, whose header explains why a `useFocusOnMount` target needs a role/name. The walker intentionally retains generic `tabindex=-1` programmatic focus wrappers in its accessibility census at `tests/tooling/design-audit-walker.ct.tsx:659-676`; this is not an instrument false positive.

**Regression proof to add.** Exercise a real rail bounce into Extensions, assert `document.activeElement` is the named region, and read its browser-computed role/name. Preserve the named `Card Atlas` child and natural Tab progression.

**Receipts.** Initial finding: `reports/runs/snap/main-348505-2026-09-13T06-42-29-931Z/run.json`. Dedicated browser ARIA/map/DOM receipt: `reports/runs/snap/main-388851-2026-09-13T06-51-27-188Z/run.json`; it proves the wrapper is `DIV`, `tabindex=-1`, with no role, `aria-label`, or `aria-labelledby`, while the child is a separate named button.

### \[P2] Settings filter button has a 36px coarse-pointer width

**What.** The icon-only `Add a search filter` button renders `36x60` in the account and compact appearances and `40px` wide in defaults. Maximal and reading reach at least 44px and do not fire. The failing user-facing states violate the coarse-pointer floor in `docs/architecture/core/UI-Architecture-and-Layout.md:382`.

**Why it hurts.** A one-handed user can miss the left or right edge of the funnel control even though the orange fill makes the full-height control look generous. The dedicated hit test found that points 21.5px left or right of center land on the ancestor row, while the same vertical offsets remain on the button. The control therefore has no hidden horizontal credit.

**Fix.** `adapt: Settings search funnel to an explicit icon-control size — preserve the current icon drawing and accessible name while giving the button an effective >=44px square/width at coarse pointers.` At the call site, `size="icon"` is the existing likely fit because that variant owns a pointer-conditional control box. The implementation lane should confirm this against the row layout rather than add feature-local padding or borrow an ancestor's geometry.

**Owner/source.** `packages/client/src/features/config/components/config-search-input.tsx:192-198`. `CommandAuxiliaryButton` merely forwards props to `Button` at `packages/ui/src/primitives/command/command.tsx:154-165`; the current call omits an explicit icon size. `packages/ui/src/primitives/button/variants.ts:59-67` documents that the icon arm owns the pointer-conditional square.

**Regression proof to add.** Extend `tests/client/features/config/components/config-search-input.ct.tsx:253-285`. Its coarse-pointer test currently pins the Command root and input height, but not the adjacent filter button. Read the resolved `--spacing-touch-target` and assert both button dimensions/effective hit area through this consumer mount.

**Receipts.** Primary audit: `reports/runs/snap/main-347155-2026-09-13T06-42-11-609Z/run.json` and its immutable PNG `.../snaps/rail-2300-config.png`. Dedicated map/ARIA/box/pointer hit test: `reports/runs/snap/main-361155-2026-09-13T06-45-40-200Z/run.json`, target PNG `.../snaps/rail-2300-config-filter-triage.png`. Appearance controls: account `main-375400-2026-09-13T06-48-54-788Z`, defaults `main-377054-2026-09-13T06-49-13-022Z`, maximal `main-378526-2026-09-13T06-49-30-813Z`, compact `main-380238-2026-09-13T06-49-48-763Z`, reading `main-382025-2026-09-13T06-50-07-238Z`.

## Detector reconciliation and retractions

The detector caught what my eye forgave: the Settings funnel looks like a large full-height orange control, but its horizontal box is only 36px. That is exactly the ancestor-credit failure class this repair was meant to stop.

The tiny visible glyphs in Chats, Characters, Databank, and Refinery were not defects. Their effective compositor targets passed; a small drawing is deliberate decoration inside a compliant target.

I retract my earlier **retraction** of the Extensions `aria-name` P1. The wrong retraction treated the child `button "Card Atlas"` as the only accessibility owner. Source proves the reported wrapper itself is the `useFocusOnMount` target, and the walker's committed control deliberately keeps this exact `tabindex=-1` focus-wrapper class in the accessibility census. The original P1 stands. Receipts: `packages/client/src/features/plugin/surfaces/extensions-switcher-surface.tsx:92-95`, `tests/tooling/design-audit-walker.ct.tsx:659-676`, and `reports/runs/snap/main-388851-2026-09-13T06-51-27-188Z/run.json`.

I also retract my first visual note that the Presets search field was clipped. Re-reading the immutable original-resolution PNG shows the full `Search presets` field; the apparent clipping came from the earlier image presentation, not the rendered surface. Receipt: `reports/runs/snap/main-351505-2026-09-13T06-43-05-710Z/snaps/rail-2300-presets.png`.

## ARIA navigability

Extensions has one confirmed ARIA/focus defect: `[data-testid="extensions-switcher"]` is the programmatic arrival-focus node and needs an appropriate region role plus the stable accessible name `Extensions list`. The child row remains correctly exposed as `button "Card Atlas"`; its name must stay on that button as a separate fact.

The Settings button has the correct browser-computed name, `Add a search filter`, and is focusable; its defect is geometry only.

Keyboard order, focus-ring visibility, and skip-link landing were outside the tap-geometry brief and were not rated.

## Persona reads

- **Casey, one-handed mobile:** 214 product controls survive the 44px coarse-pointer sampler. The Settings funnel is the single confirmed miss and is sensitive to appearance density.
- **Sam, keyboard/screen reader/low vision:** the Settings target is correctly named, while Extensions moves programmatic arrival focus to an unnamed generic wrapper. This run did not perform a full Tab walk or contrast battery.
- **Riley, stress:** the route populations ranged from 9 to 37 visible product controls and all accounting closed. The sweep covered current fixture populations and landing states, not thousand-row, modal, or error-state populations.

## Taste and flow verdict

- **Home:** looks good; hierarchy and four-item bottom navigation are clear.
- **Chats:** looks good and reads immediately as a conversation list. Several glyphs look tiny, but measured targets hold.
- **Characters:** usable but cramped. The topbar truncates its own title to `Charac...` while four controls compete on one line. This is ugly, though it is outside the hit-geometry finding.
- **Corpus:** coherent and task-focused; the empty state gives a next step.
- **Settings:** serviceable but busy. Teaching prose, search, filters, and disclosures compete in a short viewport. The orange funnel visually conceals the narrow horizontal target.
- **Extensions:** sparse but legible as a one-item page switcher: the topbar says `Extensions · 1` and the single `Card Atlas` row is the next step. The programmatic focus target still lacks that visible region identity for a screen-reader user.
- **Databank:** clear empty state, but `+ Add` and `Add a document` duplicate the same action in one view.
- **Presets:** readable and intact after the clipping retraction. Row controls are compact but their targets pass.
- **Refinery:** clean and understandable; the bare plus glyph is visually ambiguous but its target passes.
- **Analytics:** compact and readable; active state and ranked rows scan well.

Cross-surface, the mobile shell is coherent. Sheet-only sections leave a sparse footer with the active section plus Home, Chats, and You, which feels slightly uneven but remains understandable. No AI-slop pattern, text-over-art problem, or distorted image was established by this focused drive.

## What is working

1. The repaired sampler distinguishes small artwork from small hit areas: visually tiny rail/list glyphs pass while the Settings button fails.
2. Every tap population closes with no withheld, capped, collapsed, or off-viewport subjects, and the 20x20 control fires ten times.
3. Target selectors, source ownership, and browser ARIA distinguish the two product defects from the deliberate small-glyph controls and the initial Extensions mis-triage.

## Single biggest opportunity

Pin the Settings auxiliary button's coarse-pointer width in its consumer CT. The existing test already establishes the correct token and mount conditions; adding the missing adjacent-control assertion prevents this exact shrink regression without broadening product behavior.

## Route evidence

| Section | Product candidates | Product tap findings | Immutable run |
| - | -: | -: | - |
| Home | 36 | 0 | `reports/runs/snap/main-336795-2026-09-13T06-39-57-637Z/run.json` |
| Chats | 29 | 0 | `reports/runs/snap/main-341964-2026-09-13T06-41-16-964Z/run.json` |
| Characters | 37 | 0 | `reports/runs/snap/main-343313-2026-09-13T06-41-35-190Z/run.json` |
| Corpus | 18 | 0 | `reports/runs/snap/main-344779-2026-09-13T06-41-53-517Z/run.json` |
| Settings | 25 | 1 P2 | `reports/runs/snap/main-347155-2026-09-13T06-42-11-609Z/run.json` |
| Extensions | 9 | 0 | `reports/runs/snap/main-348505-2026-09-13T06-42-29-931Z/run.json` |
| Databank | 13 | 0 | `reports/runs/snap/main-350200-2026-09-13T06-42-48-220Z/run.json` |
| Presets | 18 | 0 | `reports/runs/snap/main-351505-2026-09-13T06-43-05-710Z/run.json` |
| Refinery | 12 | 0 | `reports/runs/snap/main-352524-2026-09-13T06-43-23-932Z/run.json` |
| Analytics | 18 | 0 | `reports/runs/snap/main-353664-2026-09-13T06-43-41-654Z/run.json` |
| **Total** | **215** | **1 P2** | ten runs |

Each row's PNG is the same run slot under `snaps/rail-2300-<section>.png`, and each was inspected at original or high detail.

## Console triage

Across the ten primary runs there were zero console errors, page errors, or failed requests. All 75 warnings fall into these reviewed groups:

| Warning family | Count | Disposition |
| - | -: | - |
| `[frame]`, `[perf]`, `[cls]`, `[drop]`, `[reflow]` | 71 | **INVESTIGATE outside this finding.** These were uncheckpointed boot/Home-to-section navigation observations, including repeated Home skeleton CLS and some section-entry frames. They are real observations but were not captured by a rated motion/perf arm, so they cannot support a tap-geometry defect or a clean performance verdict. |
| ECharts zero-size initialization | 4 | **INVESTIGATE outside this finding.** Analytics initializes chart work against a zero-size DOM host, likely a retained/hidden chart state. DOM tap scanning cannot adjudicate canvas behavior. |

Browser-free report copies are retained at `/tmp/rail-rendered-review-2300/console-<run-id>.log`; immutable diagnostics live in each run slot's `browser-diagnostics/diagnostics.json`.

## Practical limits

- This is a focused coarse-pointer, active-rendered, landing-state audit at the actual `430x740` device slot. It does not establish desktop, hover, keyboard, modal, context-panel, error, or thousand-row behavior.
- The account-theme ten-route pass was the breadth arm. Appearance range was rerun only on Settings after it produced the candidate: account, defaults, maximal, compact, and reading. No light-theme claim is made because geometry was the question.
- Home and Characters remain whole-scan NO-VERDICT for the unrelated population withholdings named above. Only their independently closed tap families are used.
- Snap's current fixture data determined visible population sizes. No chat was opened or sent, and no user data was changed.
- I did not run component tests, typechecks, motion, perf, Lighthouse, or the full appearance matrix. Existing source/CT paths are recommendations to the implementation owner, not verification I performed.

## Instrument coverage

| Instrument / arm | Status |
| - | - |
| `snap --design-audit --mobile` on all canonical sections | **RAN** — ten immutable runs in the route table |
| Same-invocation 20x20 positive control | **RAN** — fired once in every route; `[data-slot=side-eye-tap-control]` |
| Tap population accounting | **RAN** — 225/225 judged, no tap withholding/cap/collapse; 215 product subjects after control subtraction |
| PNG inspection | **RAN** — all ten primary PNGs; five Settings appearance PNGs; dedicated target PNG |
| Settings map + browser ARIA + box/hit-test | **RAN** — `main-361155-2026-09-13T06-45-40-200Z` |
| Browser-free report / console triage | **RAN** — all ten primary runs |
| Appearance `account` | **RAN** on Settings — 36px, `main-375400-2026-09-13T06-48-54-788Z` |
| Appearance `defaults` | **RAN** on Settings — 40px, `main-377054-2026-09-13T06-49-13-022Z` |
| Appearance `maximal` | **RAN** on Settings — no sub-44 finding, `main-378526-2026-09-13T06-49-30-813Z` |
| Appearance `compact` | **RAN** on Settings — 36px, `main-380238-2026-09-13T06-49-48-763Z` |
| Appearance `reading` | **RAN** on Settings — no sub-44 finding, `main-382025-2026-09-13T06-50-07-238Z` |
| Desktop design audit | **SKIPPED** — coarse-pointer mobile consequence was the named target |
| `--map --include-hidden` retained inventory | **SKIPPED** — the brief targets active rendered RAIL surfaces; hidden DOM cannot be scored |
| Pane-state arms | **SKIPPED** — mobile RAIL renders as the bottom bar; list/context pane geometry was not the named target |
| Keyboard walk | **SKIPPED** — not implicated by the confirmed geometry failure |
| Contrast / pixel contrast | **SKIPPED** — no color claim made; unrelated color NO-VERDICT rows were preserved as limits |
| Motion, perf, `__orb`, Lighthouse, matrix | **SKIPPED** — no animation, responsiveness, SEO, or appearance-invariance claim made |
| Component tests | **SKIPPED** — read-only review; root's separate node/CT lanes own execution |

## Integration disposition

Root read the complete independent review. The confirmed Settings target defect is filed and claimed as #2317, with a focused implementation lane and independent rendered remeasurement owed. This is a product consequence exposed by the repaired instrument; it does not retract the instrument SHIP verdict. The integrated twelve-file component train passed 421/421 with zero failures, flakes, or skips; its command and terminal summary are preserved in `reports/runs/ct/main-311860-2026-09-13T06-34-55-378Z/integration-command.log`. The separate non-tap observations and whole-scan withholdings remain explicitly unadjudicated where the review says so. No whole-program acceptance is claimed.

## Follow-up correction and ownership

The reviewer corrected the original Extensions retraction after tracing the actual focus owner; root independently confirmed the source and the Presets precedent. That product accessibility defect is now #2321. Settings #2317 is repaired in `b5b93c151` with a compact-density hit-test regression and passing client/root native checks; independent live remeasurement remains owed. The broader observation dispositions are preserved in `v-rail-followup-disposition-2026-09-13.md`. The earlier report version remains in `aec0ffb55` as explicit provenance for the overturned judgment.
