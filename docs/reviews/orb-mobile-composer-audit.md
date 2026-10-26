# Orbweaver mobile composer comparison

## Status

This report records the comparison that informed the redesign. The [implementation review](composer-implementation-review.md) owns the corrected behavior and final evidence.
Preserve the sticky message identity and action header; the owner explicitly wants that behavior.
The goal is coherent writing, plugin presence and reading space, not visual parity with SillyTavern.

## Evidence scope

Main drives Snap against the private Docker database and assets clone, using a populated Hikari session and enabled plugins.
Application source is `38b707326b`, which adds development-only plugin inventory to the existing product surface.
Portrait is 390 × 844; landscape is 844 × 390. Chromium reports coarse pointer and DPR 3. Real Safari chrome, keyboard and safe-area behavior remain unqualified.
No generation, command execution or production preference change is part of this review. Appearance changes use response shims.

Private artifact indexes are `reports/surface-review-private/orb-mobile-artifacts.json`, `orb-appearance-artifacts.json` and `orb-head-artifacts.json`.
Copies of screenshots, run indexes and typed evidence are retained under `reports/surface-review-private/orb-mobile-evidence/`, outside Snap's run-slot pruning.
Browser traces and diagnostic rings are not included in that copy; they remain in the original run slots.
The reference comparison is [SillyTavern with Moonlit Echoes](composer-reference-review.md).

## Confirmed findings

### Composer hierarchy and short-height budget

The composer measures 150px high in both orientations, approximately 38 percent of the landscape height.
Portrait collapses plugin commands into a menu; landscape promotes full attributed command labels beside the native generation controls.
The shell also restores its desktop rail at the landscape width. This is an existing responsive regime, not evidence of a raw-value bypass.
The visual result leaves little reading height and changes the action hierarchy on rotation.

The compact painted glyphs have a separate hit-area mechanism. Their 32px painted boxes alone do not establish a touch-floor defect.
An initial DOM box inventory also includes inert plugin measurement copies; those are not visible commands or overflow findings.

### Plugin presence has separate controls

`use-plugin-chat-visibility.ts` stores hidden panel plugins and whole-column collapse separately.
`use-visible-anchored-surfaces.ts` applies panel visibility before mounting surfaces.
`plugin-composer-placements.tsx` independently chooses commands from registered placements, sorts them and admits a width-fitting prefix as text buttons.
Panel hiding therefore does not express the user's preference for permanent composer commands.

Treat plugin enablement, permission, panel visibility and command prominence as different facts with clear controls.
Do not add another concealment switch without reconciling those existing homes.
A menu-first command surface is the preferred direction to validate; preserve visible attribution inside it and do not disable plugin functionality to remove clutter.

### Reading defaults need a separate decision

The copied account has in-chat avatars disabled. Its captures do not establish the appearance of a new account.
Actual schema defaults were evaluated directly, rather than assumed from the named Snap preset.
The preset's avatar size is `md`, while the current schema default is `lg`; it cannot be treated as an exact default snapshot.

The default bubble plus large-avatar layout is noticeably narrow in portrait. A flat, small-rounded-avatar trial is easier to read without increasing text size.
The trial also removes quote colorization and composer blur. This is a bundled design candidate, not an isolated proof of each axis's contribution.
The composer remains 150px high under the trial, so appearance defaults cannot solve its structural cost.

The qualified message-start captures cover large round, medium square and small rounded identity avatars, plus portrait-aspect art skins.
Echo retains side-art space; Ripple keeps its portrait column beside scrolled prose. Whisper's landscape banner can occupy nearly the entire initial reading window above the composer.
These are space-allocation findings, not requests to remove the sticky header or collapse every skin into Flat.

## Menu observations

Chat options, Message tools, plugin actions and the impersonation-person picker were opened in both orientations using actual touch actions.
Their native scenario steps passed. The inspected popups remain within the viewport; long menus use scrolling rather than ST's above-screen clipping.
Message tools is still visually large and conceptually mixed: game actions, story direction, media, plugin commands and input operations share one menu.
Mechanical containment is working in these views; information architecture remains a design concern.

Plugin panels and the image-mode preview were also opened in both orientations without executing commands.
The plugin drawer stacks Pocket Arcade before Story Clocks. The game's large width-driven board dominates the short landscape sheet.
The landscape image dialog shows mode controls but requires scrolling to reach its lower form. That lower-form scroll journey remains untested.

## Implementation direction

The [implementation review](composer-implementation-review.md) records the Context panels, menu-first composer, reading defaults and schema-derived Snap profile.

The [approved composition](composer-mock-study.md) owns the implementation decisions and owner authorization.
Preserve native generation actions, plugin attribution, explicit permissions and the sticky message identity/action header.

## Review judgments

Comparison aesthetic score, H8 only: the compared composer 2/4 in portrait and landscape; compared default portrait reading 2/4; quiet-flat portrait reading 3/4.
These are not complete Nielsen totals or accessibility certification. Preserve the sticky header and menu collision behavior while improving grouping and reading space.

### Instrument coverage

| Instrument | Coverage |
| - | - |
| Snap screenshots | Inspected account-state skins in both orientations, menu states, defaults and avatar candidates. The isolated incomplete image is excluded. |
| Map and ARIA | Composer and menu discovery, panel drawer and image preview. |
| Computed geometry | Composer height, viewport posture, selected boxes and document scroll width. Hidden measurement copies are excluded from visual conclusions. |
| Design audit and Lighthouse | Not run in this focused comparative pass; it does not claim an automated accessibility verdict. |
| Contrast | Not measured; no contrast-ratio finding is asserted. |
| Motion and performance | Not measured; development render timings are not production verdicts. |
| Real Safari and keyboard | Not run. |
| Product tests | Not rerun; no product code changes. |

## Instrument limitations

A flat portrait capture produced an incompletely painted image despite successful drive output; the separate first capture and menu rest view show the surface.
The unqualified image is retained and does not establish a product blank screen.
An attempted message-start probe searched for an HTML article tag, while the app renders the article role on another element. Its `found: false` output provides no start-position evidence.
Corrected probes require the observed article role and throw if no target exists. Do not use the earlier `orb-start` set to qualify avatar placement.
The first menu scenario used an invalid defaults value and was refused before driving; the corrected scenario uses the documented string array.
