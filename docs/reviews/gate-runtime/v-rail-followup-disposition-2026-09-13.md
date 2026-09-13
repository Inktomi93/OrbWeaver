---
kind: review
status: active
updated: 2026-09-13
---

# RAIL rendered follow-up dispositions — 2026-09-13

This follow-up corrects the Extensions ARIA judgment and maps every non-tap observation from `/tmp/rail-rendered-review-2300/review.md` to current issue state. It is source/report-only: no new browser, motion, product, Project, or user-data mutation occurred.

## Issue-search method

I read the full bodies of every plausible open match, including #1191, #418, #159, #1796, #1719, #1939, #1729, #1181, #1263, and #2317. I also searched all open issue titles and bodies for the exact mechanism vocabulary: `maskedForeground`, `selection-idiom`, `ECharts`, `zero-size`, `canvas`, `SectionContent`, `Activity`, `useFocusOnMount`, `programmatic focus`, `focus target`, `aria-name`, `accessible name`, `Extensions`, `Characters title`, `Databank`, and `duplicate action`. Closed #1059, #1078, #1079, #1662, and #1705 were read as precedent only; they are not represented as live tracking.

## Disposition table

| Observation | Classification | Existing OPEN owner | Disposition and evidence |
| - | - | - | - |
| Home whole-run `NO-VERDICT`: `maskedForeground=2` in contrast, inactive-control-legibility, and text-over-art | **Correct instrument refusal; product subjects unadjudicated** | **None** | This is not an instrument defect and cannot be called clean. Closed #1078 repaired the mask-blind false-clean class; the current run now withholds exactly as that repair requires. The run does not retain selectors for the two withheld foregrounds, so no product contrast bug is established. A future full color audit must identify the two candidates and use framebuffer/pixel evidence. Receipt: `main-336795-2026-09-13T06-39-57-637Z` and `home-report-all.log`. |
| Characters whole-run `NO-VERDICT`: `selection-idiom unmatchedUnselected=1` at `Group by tag` | **Accept as designed at rest** | **None** | Closed owner decision #1059 explicitly rules that the all-unselected Characters cohort remains WITHHELD at rest; the surface needs a driven selected twin to complete that family. This run reproduces the ruled state, not a regression. Tap accounting remains independently complete. Receipt: `main-343313-2026-09-13T06-41-35-190Z`. |
| Extensions `[data-testid="extensions-switcher"]` `aria-name` P1 | **Confirmed PRODUCT accessibility bug** | **None; new issue required** | The original audit was right. `ExtensionsSwitcherSurface` calls `useFocusOnMount(surfaceRef)` and mounts the ref on an unnamed, role-less `Container tabIndex={-1}` (`extensions-switcher-surface.tsx:92-95`). The child `button "Card Atlas"` is a different accessibility owner and cannot name the focused wrapper. The walker intentionally keeps programmatic focus wrappers in the accessibility census (`design-audit-walker.ct.tsx:659-676`). Presets documents and implements the exact named-region precedent (`preset-library-surface.tsx:55-60`). No open issue body owns this; #418 is an accname-computation convergence row, #1263 is test-name liveness, and #1191 is pane sizing. Receipts: `main-348505-2026-09-13T06-42-29-931Z` and `main-388851-2026-09-13T06-51-27-188Z`. |
| Four ECharts zero-width/height warnings on Analytics mobile landing | **Unadjudicated PRODUCT runtime signal with a source-backed hypothesis** | **None** | One run emitted four identical warnings during Analytics entry. On the mobile list landing, `.shell-content` is deliberately `display:none` (`shell.css:1404-1413`) while `AppShell` still builds the active section's CONTENT body (`app-shell.tsx:175-185`) and `SectionContent` marks the active body `Activity mode="visible"` (`section-content.tsx:34-74`). Analytics overview contains populated charts, so ECharts can initialize against the zero-size hidden content host. This is a strong cause hypothesis, but the dogfood ladder still owes a second focused reproduction before `bug` classification. Open #159 redesigns Analytics IA; #1796 governs CONTEXT lifecycle; closed #1079 governs canvas-ink accounting. None owns this runtime warning. Do not hide it under those rows. Receipt: `main-353664-2026-09-13T06-43-41-654Z/browser-diagnostics/diagnostics.json`, four warnings at timestamps 1789281825953-5960. |
| 71 `[frame]`/`[perf]`/`[cls]`/`[drop]`/`[reflow]` warnings across primary runs | **Unadjudicated boot/navigation observations** | **None exact** | The runs were not checkpointed or rated motion/perf arms. Most warnings belong to cold Home hydration and the Home-to-section navigation queue, including repeat `0.0886` skeleton CLS and some section-entry work. #1729 owns panel-FLIP performance and #1181 owns chat-room transcript settle; their full bodies describe different triggers. Do not map these warnings to either. A dedicated checkpointed reproduction is required before filing. |
| Characters mobile title truncates to `Charac...` while four topbar controls share the row | **Confirmed UGLY/header-sizing symptom** | **#1191** | #1191's full body owns the cross-RAIL LIST/CONTEXT header and sizing inventory and convergence. Append the current mobile screenshot evidence there; do not mint a second issue. Receipt: `main-343313-2026-09-13T06-41-35-190Z/snaps/rail-2300-characters.png`. |
| Extensions looks empty/unfinished with one `Card Atlas` row | **Retracted taste defect; accept as designed** | **None** | The source establishes this surface as a page switcher with exactly one row per granted-and-enabled `ui.page`. It renders a teaching empty only when there are zero pages (`extensions-switcher-surface.tsx:1-18,35-88`). The screenshot shows the count `1` and its one named row; this is a sparse valid roster, not a loading or empty state. The separate unnamed arrival-focus bug stands. |
| Databank shows topbar `Add` and empty-state `Add a document` | **Accept as designed with source citation** | **None** | Both are intentional entry points into one global `addDocument` modal. `add-document-modal.tsx:1-13` records why the ceremony has one global home while surfaces own explicit openers; `databank-list-header.tsx:92-127` owns the band primary and `databank-library-surface.tsx:281-325` requires the empty/no-match way out. Open #1719 fixes the duplicate-action rule's wrong doc citation; #1939 decides how rule allowances migrate. Neither is product work for this sanctioned pairing. |
| Settings is visually busy/text-heavy | **Taste note, no separate contract violation established** | **#2317 owns only the measured geometry defect** | Keep this as review context. Do not broaden #2317 or file a redesign issue from one landing screenshot. |
| Refinery bare plus glyph is visually ambiguous; mobile footer can feel sparse | **Unadjudicated taste observations** | **None** | The measured target passes, and this review did not perform task comprehension or navigation testing. These do not clear the reproduce/root-cause rungs and should not become bug claims. |

## Correction replacing the prior Extensions text

The following text now replaces the incorrect retraction and ARIA-clean claims in the primary review:

> **\[P1] Extensions moves arrival focus to an unnamed generic wrapper.** `ExtensionsSwitcherSurface` calls `useFocusOnMount(surfaceRef)` and puts that ref on `<Container tabIndex={-1}>` without a role or accessible name. On real section navigation, that wrapper is the element focus moves to. The child `button "Card Atlas"` is correctly named, but a descendant's name does not name the focused wrapper. Give the focused container the appropriate region role and stable `Extensions list` accessible name, following the Presets list precedent. Preserve the existing child-row name and focus behavior.

> **Retraction of my retraction.** My earlier retraction treated the child `button "Card Atlas"` as the only accessibility owner. Source proves the reported wrapper itself is the `useFocusOnMount` target, and the walker's committed control deliberately keeps this exact `tabindex=-1` focus-wrapper class in the accessibility census. The original P1 stands.

`/tmp/rail-rendered-review-2300/review.md` has been edited so its verdict, ranked findings, detector-reconciliation section, ARIA section, and working-summary all carry this corrected judgment rather than conflicting prose.

## Non-target raw detector rows

The Home run also emitted three P3 `duplicate-action-door` rows pairing character-named controls with the `Character quick-picks` shelf. They were outside the hit-geometry target and were not human-driven to determine whether the paired controls open the same existing chat, start a new chat, or perform another distinct action. Closed #1662/#1705 discuss similar but different Characters-region pairings and do not automatically govern this Home pair. With no action-semantic reproduction in this bounded pass, these remain raw detector leads and should not be filed or silently called false positives.

Databank's `flat-type-hierarchy` P3 and other non-target appearance-rule rows were likewise not promoted by this review. The screenshot read did not establish a user-harming hierarchy failure, and no focused typography battery ran.

## Filing recommendations

1. **File the Extensions focus target as a new P1 product bug.** Suggested outcome: a rail bounce into Extensions lands focus on a region named `Extensions list`; its child row remains `button "Card Atlas"`; natural Tab order is preserved. Suggested owner: `packages/client/src/features/plugin/surfaces/extensions-switcher-surface.tsx` plus its focused CT.
2. **Append the Characters mobile screenshot to #1191.** It is evidence for that existing header/sizing inventory.
3. **Do not file Home/Characters NO-VERDICT rows.** Home owes manual color adjudication in a future full audit; Characters is a ruled rest-state refusal.
4. **Retain the ECharts warning as an evidence lead.** If a second focused mobile Analytics entry reproduces the four warnings, file a new product/runtime bug around hidden active CONTENT initialization. Do not assign it to #159, #1796, or closed #1079.

## Integration ownership

The source and issue-search evidence above predates filing #2321, which now owns the confirmed Extensions focus-target defect. #2317 owns the Settings target repair. The Characters screenshot is attached to existing #1191 in issue comment `5651853416`. No new product defect is inferred from the unadjudicated runtime or color observations.
