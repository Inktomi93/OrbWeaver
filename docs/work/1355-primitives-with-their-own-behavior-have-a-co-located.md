---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: ui
plan: test-foundation
---

# Primitives with their own behavior have a co-located CT

## What

A ui primitive needs its own CT only where its seal adds behavior no feature CT pins (`UI-Primitives-and-Reuse.md` §13.7). Candidates: color-field, combobox chips, macro-textarea, file-dropzone, sortable, the table sort button, reveal-gate, the textarea autosize fallback, virtual-list, message-list, media-grid, and any state a feature cannot reach (disabled reason, error, coarse-pointer touch floor). Several already have one.

## Why

The test-foundation plan picks cases by risk and distinct behavior, not per-file quotas. A plain Base UI wrap is exercised by every feature surface that mounts it; a CT for it repeats Base UI's own tests.

## Done when

Each candidate is compared against its feature coverage and gets a keep, rebuild or drop decision in this item; each kept primitive CT mounts the primitive under `CtIsolation` and covers the R7 shapes that apply to it; no CT is added for a primitive whose behavior feature CTs already pin.

## Evidence

Each candidate was compared with the CTs that mount it. Feature coverage was searched across `tests/**/*.ct.tsx`, story modules and e2e specs.

| Candidate | Decision | Basis |
| - | - | - |
| color-field | build | Feature CTs mount it only for field identity (`tests/client/features/app-shell/_field-identity-stories.tsx`). The commit gate, draft reseed, clear sentinel and neutral picker seed had no case. `tests/ui/primitives/color-field/platform-color-field.suite.ct.tsx` |
| combobox chips | build | One consumer, the world-info entry editor, and its member suite does not touch chips. Free-text commit, split, dedupe, cap and a fresh-array parent had no case. `tests/ui/primitives/combobox/platform-combobox-chips.suite.ct.tsx` |
| sortable | build | No CT mounted it. Keyboard reorder, mid-drag focus, the live-region script and rank attributes are the seal's own wiring. `tests/ui/primitives/sortable/platform-sortable.suite.ct.tsx` |
| table sort button | build | No CT mounted it. Sort cycle, `aria-sort`, null placement, controlled sort and paging over sorted rows. `tests/ui/primitives/table/platform-table-sort.suite.ct.tsx` |
| reveal-gate | build | No CT mounted it. Unmounted-until-reveal, focus transfer, announcement, disabled and controlled state. `tests/ui/primitives/reveal-gate/platform-reveal-gate.suite.ct.tsx` |
| macro-textarea | keep | `tests/ui/primitives/macro-textarea/platform-macro-description.suite.ct.tsx` |
| textarea autosize fallback | keep | `tests/ui/primitives/textarea/textarea-autosize.ct.tsx` |
| message-list | keep | `tests/ui/primitives/message-list/input-channels.ct.tsx` and `scrollport-lifecycle.ct.tsx` |
| media-grid | keep | `tests/ui/primitives/media-grid/spotlight.ct.tsx` |
| file-dropzone | keep, CT owed | Feature CTs reach only the file-picker path through `setInputFiles` (`tests/client/features/app-shell/components/background-upload.ct.tsx`). Drag-and-drop and the `accept` refusal in `packages/ui/src/primitives/file-dropzone/accept.ts` have no case. Not built in this leg |
| virtual-list | keep, CT owed | Windowing is exercised through `tests/client/features/tag/surfaces/labels-retry.ct.tsx` and the e2e virtualizer parity specs. The scope reset handshake, the edge fade and the unbounded-window throw have no case. Not built in this leg |
| states a feature cannot reach (disabled reason, error, coarse-pointer floor) | no standalone CT | Pinned per primitive where its seal adds the state; none was found without a named owner here |

Each new CT mounts the real primitive under `CtIsolation` through a story beside the spec, asserts behavior the seal adds, and stays out of copy text. The file names start with `platform-` so the WebKit project selects them. Every suite was run red against planted defects in the primitive, then green with the primitive restored (`git diff -- packages/ui` empty):

- reveal-gate: a removed focus transfer, an ignored `disabled`, a controlled gate that reveals itself and a silent announcement. Every case failed. The Reveal and Hide buttons share a child position, so React keeps one DOM node across the click and a click-driven case cannot show the focus effect. The focus assertions sit in the no-hide-trigger case and in a case where a control outside the gate drives the reveal; removing the effect alone fails exactly those.
- table: null placement tied to direction, a sort that never returns to unsorted, paging over source order, and a controlled sort that reorders itself. Each failed its own case.
- sortable: a removed focus keeper, the stock live-region script and removed rank attributes. Each failed its own case.
- color-field: an ungated commit, no reseed on open, a black picker seed and an ignored `disabled`. Each failed its own case.
- combobox: no dedupe, no cap in `commitDraft`, no comma split and a draft not cleared after commit. Each failed its own cases.

Green runs: `pnpm test:ct` (Chromium) and `pnpm test:ct:webkit` (WebKit iPhone project) over the five suites, with a distinct `CT_PORT`. Layer: CT. Production entry: the real `@orb/ui` doors (`@orb/ui/reveal-gate`, `/table`, `/sortable`, `/color-field`, `/combobox`) mounted through `mount<typeof Story>` and `CtIsolation`; no application data is involved.
