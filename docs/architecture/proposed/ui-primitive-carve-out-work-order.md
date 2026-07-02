# @orb/ui — Primitive Carve-Out Work Order (CONSOLIDATED)

Mined from docs/architecture/proposed + neo-tavern audit, validated 2026-07-02. This document
supersedes the original work order and its addendum — all amendments are merged in.

You are building NEW primitives and EXTENDING existing ones in `packages/ui`. Read
`docs/architecture/proposed/ui-package-design.md` in full first — its conventions (Base UI
seals, tv() variants, intent tokens never raw color, satellite-seal dep rules, the
domain-agnostic + ≥1-committed-consumer inclusion litmus in §12) are binding law for everything
below. Match the existing primitive dirs' file shape (component.tsx / variants.ts / index.ts)
and their test patterns under tests/ui/primitives/.

**neo-tavern reference:** /home/inktomi/inktomi-stack/development/neo-tavern is the predecessor
app. Several items below cite proven implementations there. You may READ neo-tavern for
reference; never import from it, and strip all neo domain knowledge on port — neo components
import domain stores/catalogs directly, which violates @orb/ui law; yours take everything via
props.

Every item cites the design doc that demands it. When a behavior question isn't answered here
or in the cited doc section, pick the simplest answer consistent with ui-package-design's
conventions and note it — do not invent extra API surface.

## Ground rules (binding)

- No file changes outside packages/ui + tests/ui, EXCEPT package.json/pnpm-lock for exactly
  two approved dependencies: `@dnd-kit/react` + `@dnd-kit/helpers` (item 15) and `minisearch`
  (item 18). Nothing else adds a dependency.
- Intent tokens only, never raw colors. All interactive states per the house 8-state
  convention. prefers-reduced-motion respected anywhere motion exists.
- Satellite deps stay inside their sealed dirs (dep-cruiser `ui-satellite-seals`). Add
  `@dnd-kit → sortable/` and `minisearch → macro-textarea/` to that rule and record both in
  the dep table alongside the other seals.
- Tests: behavior and a11y contracts per primitive, matching tests/ui/primitives patterns.
  No shit tests — assert the states/contracts named per item, not that React renders.
- Commit per coherent chunk; run the full gate (`pnpm check` + ui tests) and READ THE ENTIRE
  OUTPUT before calling anything done.

## Suggested order

1. **Part A** (extensions, small, unblocks consumers): A1–A5
2. **Small new primitives**: 19, 20, 21, 22 (proven neo chrome), then 7, 9, 16, 17
3. **Medium**: 8, 10, 11, 12, 13, 14
4. **Heavy** (real design weight): 6, 15, 18

---

## A. Extensions to EXISTING primitives

### A1. toast — action slot
`primitives/toast/toast.tsx` renders only Title/Description/Close. Add an optional action
(button/link) slot.
- Consumer: hub-browse import toast with "Open character" (hub-browse-design/03 §6).

### A2. autocomplete — multi-select with chips
Add a multi-select mode: selected values render as removable chips, `maxItems?` cap, free-text
entries allowed alongside suggestions.
- Keyboard: Enter adds, Backspace removes last, labeled remove button per chip
  (`aria-label="Remove {value}"`).
- Must ALSO work with NO suggestions — pure free-text chip entry: commit on Enter AND comma,
  trim + dedup on commit, Backspace on empty input pops the last chip.
- Reference shape: neo-tavern .../world-info/components/world-entry-keys-input.tsx.
- Consumers: expressions label picker — up to 8 labels, seeds + custom (expressions-design/03
  §1, 04 §5); hub-browse tag include/exclude chips (03 §6); world-info keyword triggers; tag
  editors.

### A3. switch — read-only display state
`readOnly` already passes through to Base UI via prop spread; add a distinct visual treatment:
a read-only switch must still read clearly as ON/OFF, NOT the disabled grey-out (non-host
viewers must not misread an enabled toggle as off). Styling/data-attr only, no API change
beyond documenting `readOnly`.
- Consumer: chat-crew member toggles, "members see read-only state" (chat-crew-design/07 §1).

### A4. SegmentedClock — "hidden" treatment
`charts/meter/segmented-clock.tsx` has no hidden/redacted variant. Add one: dimmed + a
non-color signal (lock/eye-off icon from the existing icons set — never color alone).
- Consumer: rpg GM-eyes tab hidden clocks (rpg-design/11-client-ui.md §15).
- NOTE: Meter arc/bipolar/milestones/dangerBelow is ALREADY BUILT in charts/meter/meter.tsx —
  do not touch it.

### A5. code-editor — diagnostics layer
Extend the existing CodeMirror seal to accept
`diagnostics?: { severity: 'error'|'warning'; message: string; from: number; to: number }[]`
and render them via CM6's lint API (inline marks + gutter).
- Diagnostics re-render on prop change without remount/cursor-jump.
- Expose via aria-describedby/live region, not color alone.
- The CM6 import stays inside the code-editor seal dir (dep-cruiser rule).
- Consumers: automation rule editor CEL/macro diagnostics with spans (automation-design/02 §5,
  MacroDiagnostic); themes custom-CSS warn-on-@import field (themes-design.md §4).

---

## B. NEW primitives

Each: component + variants + index export + tests, per house pattern.

### 6. media-grid
`primitives/media-grid`, or a grid mode on the virtual-list seal — your call, but TanStack
Virtual imports stay inside the sealed dir per `ui-satellite-seals`. The existing VirtualList
is strictly 1D (no lanes) — this is the hard gap.
- Virtualized responsive N-column grid of square cells, lazy-loading, reserved cell boxes
  (no layout shift).
- Generic item shape `{ id, thumbUrl?, animated?, alt }`; animated items render the original,
  not a resized variant.
- Optional selection mode.
- Grid keyboard nav (roving tabindex) + per-cell accessible name.
- Consumers: gallery grid G4 (gallery-design.md §1.2, §8), hub-browse result grid (03 §6),
  expressions sprite grid (04 §5).

### 7. status-chip
`primitives/status-chip`. Background-job state chip.
- Props: `status: 'idle'|'running'|'succeeded'|'failed'`, optional summary text, optional
  pre-formatted timestamp string (ui takes a string — no Intl/time logic in ui), optional
  retry slot rendered on failed (a real button).
- Composes badge + spinner. `aria-live="polite"` on transitions; failed state carries an icon,
  not color alone.
- Consumers: chat-crew member/guide chips (chat-crew-design/07 §2–3, §6 — "the standard
  workload vocabulary"), expressions generation progress, plugin status.

### 8. compare-blocks
`primitives/compare-blocks` — Before/After review.
- Renders `blocks: { label, before, after }[]` as intent-tinted pairs (before = danger tint,
  after = success tint, INTENT TOKENS ONLY).
- Optional per-block accept checkbox + "accept all".
- Non-color before/after signal: visually-hidden "Before"/"After" text + a glyph — the docs
  specify tint; colorblind distinction is your obligation.
- One component handles BOTH shapes: single full-text pair (prose audit) and multi-field
  itemized pairs (card evolution) — blocks length 1 vs N, no separate modes.
- Distinct from the `diff` seal (token-level) — do not build on jsdiff. The crew-specific
  `proposal-diff.tsx` wrapper stays in client/features; you ship only the generic renderer.
- Consumers: chat-crew card evolution (07 §4.2) and prose audit (07 §4.3).

### 9. avatar-stack
`primitives/avatar-stack`. N overlapping avatars + "+N" overflow chip.
- Props: items `{ src?, name }[]`, `max?`, size variants matching avatar's.
- Group aria-label with full count; each avatar keeps its name as accessible name.
- Composes the existing avatar primitive; no new deps.
- Consumer: saved-rosters picker "name + member-avatar stack + count"
  (saved-rosters-design.md §6).

### 10. file-dropzone
`primitives/file-dropzone`. A real `<input type="file">` under the hood (keyboard/SR
operable — drag-and-drop is progressive enhancement only).
- Props: `accept?`, `maxSizeBytes?` (client-side pre-check + display; value injected, never
  baked in), `multiple?`.
- Drag-over highlight, disabled state, error display. No new deps.
- Consumers: databank upload (bytes/mime/name, 20 MB default — databank-design/06 §1, 02 §6),
  plugin install-from-zip, avatar/asset uploads.

### 11. highlighted-text
`primitives/highlighted-text`. Long plain text with `[start,end)` char-offset highlight ranges
as real `<mark>` elements (SR-announceable).
- Scroll-to-first-highlight on mount; one or many ranges.
- Plain DOM/CSS; if windowing is needed compose the virtual-list seal — no direct TanStack
  Virtual import.
- Consumer: databank source viewer — charStart/charEnd exist so "the Phase-6 panel can
  highlight a retrieved chunk in the source document" (databank-design/02 §2.1).

### 12. log-viewer
`primitives/log-viewer`. Read-only monospace line panel. NOT code-editor — read-only and dumb.
- `lines: string[]`, optional per-line level (info/warn/error → intent token + glyph).
- Pinned-to-bottom autoscroll (respects reduced motion), `maxLines?`, copy-to-clipboard.
- `role="log"` + `aria-live="polite"`.
- Virtualize via the virtual-list seal when long.
- Consumers: plugin log view (256-line/16 KiB ring — plugin-design/03 §3), SnippetResult
  logLines echo, generic job output.

### 13. color-field
`primitives/color-field`. Swatch-only display variant + editable variant (swatch trigger →
popover with native `<input type="color">` + hex text field — no color-picker library).
- Always shows the hex/text alternative; label association via the field primitive.
- Validation aligns with the D44 color clamp (parse-as-color, reject url()/expression()) —
  mirror the ThemeScope clamp, don't reinvent.
- Consumer: themes editor — ThemeOverride's accent, userBubble{bg,fg}, aiBubble{bg,fg},
  optional systemBubble, dialogueColor, narrationColor, bodyColor (themes-design.md §3.1).

### 14. tool-call-block
`primitives/tool-call-block` — the D48 generic tool-invocation block.
- Collapsible (native `<details>` semantics or the collapsible primitive): tool name;
  arguments (attempt JSON.parse → pretty-print in a plain monospace `<pre>`; on parse failure
  render the raw string — NEVER blank); result document or error.
- Three states driven ONLY by the record: `isError: true` → error styling (intent token +
  icon); `result === null` → neutral "requested, not run" badge; else success.
- `durationMs` display-only. No CodeMirror.
- Contract: tool-use-design/03 §4 (binding MAY/MAY-NOT rules — read them) and 05 §T7. The
  TOOL_RENDERERS registry is client/features wiring, NOT yours — ship only the fallback block.

### 15. sortable seal
`primitives/sortable`. Dep: `@dnd-kit/react` ^0.5.0 ONLY — this is the modern rewrite.

**HARD RULE:** do NOT install or import `@dnd-kit/core`, `@dnd-kit/sortable`, or
`@dnd-kit/utilities` — those are the legacy stack (dead since 2024) and they are what your
training data will reach for. If you find yourself writing `DndContext`, `SortableContext`,
`arrayMove`, or importing useSortable from `@dnd-kit/sortable`, you are hallucinating the old
API — stop and re-read the docs. The modern shape is: `DragDropProvider` (from
`@dnd-kit/react`) + `useSortable({ id, index, handle?, group? })` returning
`ref`/`handleRef`/`isDragging`, `onDragEnd` on the provider, and the `move()` helper from
`@dnd-kit/helpers` for reorder math. The package is 0.x — verify the current API against
https://dndkit.com/react/hooks/use-sortable before writing code.

- Seal surface: generic reorderable list — `items`, `getItemKey`, `renderItem`,
  `onReorder(orderedKeys)`, optional drag handle mode. Controlled; optimistic state is the
  caller's concern.
- KEYBOARD: the new package's keyboard support is thinly documented — verify keyboard reorder
  works end-to-end in the test suite (focus item → move with arrows/space → aria-live
  announcement); if the lib doesn't provide it, wire it yourself or flag it as a blocker in
  the PR rather than shipping pointer-only.
- @dnd-kit imports stay inside the seal dir; add `@dnd-kit` to the `ui-satellite-seals`
  dep-cruiser allowance.
- Consumers: automation reorderRules "the ST-familiar drag list" (automation-design/04 §2),
  saved-rosters member reorder (§6).

### 16. crossfade-image
`primitives/crossfade-image`. Two-layer CSS opacity crossfade on `src` change (~300ms,
`durationMs?` prop), collapsing to instant swap under prefers-reduced-motion.
- Reserves its layout box (aspectRatio prop) even when src is null. `alt` required.
- Plain CSS, no animation lib.
- Consumer: expressions sprite stage (expressions-design/04 §2, §6 test plan).

### 17. reveal-gate
`primitives/reveal-gate`. Deliberately-hidden content behind an explicit "Reveal" click
(shared-screen privacy, not disclosure-for-density — this is not collapsible).
- DECISION, dictated: content is CONDITIONALLY MOUNTED, not CSS-hidden — pre-reveal the
  children must not exist in the DOM (CSS-hidden secrets are still readable via inspect/SR).
- Props: `label?`, controlled/uncontrolled `revealed`, `onReveal?`, optional re-hide
  affordance. Placeholder is a neutral masked panel.
- Consumer: chat-crew director drawer — arc/twist bank "behind a Reveal click even for the
  host" (chat-crew-design/07 §4.4).

### 18. macro-textarea — PORT from neo, don't design from scratch
`primitives/macro-textarea`. A complete working implementation exists:
neo-tavern/src/client/components/macro-textarea.tsx (235 lines) + macro-textarea-logic.ts
(60 lines — pure trigger-detection/insertion functions, port these nearly verbatim with their
tests). Read both in full first.

Pre-ratified design decisions (do not re-litigate): custom popover on the SAME textarea (cmdk
rejected — focus jump; Base UI Autocomplete is whole-input-only so it cannot be the base,
per ui-package-design §12); typing `{{` mid-text opens the filtered suggestion popover;
ArrowUp/Down + Enter/Tab insert with cursor reposition; Esc closes leaving value+focus alone;
empty-suggestions = closed popover; controlled value/onChange; prefix filtering with category
group headers; combobox/listbox ARIA semantics.

Genericize on port:
- (a) neo imports its macro catalog directly (PROMPT_MACROS) — replace with a
  `suggestions: { name, category?, description?, args?: string[] }[]` prop. The macro
  registry/queryMacros wiring is app-level — ui never imports domain code.
- (b) Fuzzy matching: bring `minisearch` — this is a DECIDED dependency, do not substitute a
  prefix filter. Port neo's module-level lazy-singleton index pattern (neo's comment explains
  why: macro-bearing editors mount ~8 of these at once and per-instance index builds
  re-tokenized the catalog every mount) — but since the catalog is now a prop, key the
  memoized index by the suggestions array identity instead of a true module singleton. The
  minisearch import stays sealed inside the macro-textarea dir; add
  `minisearch → macro-textarea/` to the ui-satellite-seals dep-cruiser rule and record it in
  the dep table alongside the other seals.
- (c) ADD the `::`-arg hint display after insert (orbweaver's automation macros take args;
  neo's didn't).

Keep v1 minimal: no syntax highlighting inside the textarea, no nested-macro awareness —
completion + arg hints only. Still write the 1-page design note in the PR/commit description,
but it's a port delta, not a blank page.
- Consumers: automation rule templates + macro fields (automation-design/02 §5), ST-parity
  macro entry across entity editors.

### 19. list-row
`primitives/list-row`. Slot-based entity row: leading slot (avatar/icon), title, optional
subtitle/meta line, trailing actions slot.
- States: clickable (renders as button semantics with focus ring), selected, disabled.
- Density variants (default/compact). Truncation: title/meta ellipsize, full text via title
  attr.
- A11y: when clickable the row is ONE button/link — trailing actions are separate tab stops
  OUTSIDE the row's accessible name, not nested interactive content.
- Evidence: neo hand-rolled this 7 times (character-row, persona-row, user-row, session-row,
  credential-row, workload-row, chat-history-row).
- Consumers: every orbweaver list surface (library, presets, rules list, plugin list,
  databank documents, roster library).

### 20. setting-row
`primitives/setting-row`. Label left (htmlFor-wired), control docked right, optional hint
behind an info-glyph tooltip (icon gets the hint as aria-label), optional
disabled-with-reason note.
- Reference: neo .../user-admin/components/setting-row.tsx (89 lines — near-portable, strip
  nothing but imports).
- Consumers: themes appearance panel (themes-design §3.4), automation budget panel, crew
  member knobs, plugin/admin settings — every settings surface in the app.

### 21. selection-bar
`primitives/selection-bar`. Bulk-action bar shown only while a selection exists: count text
("N selected"), actions slot, cancel/clear button.
- Props: count, onClear, children (actions); render-null-when-zero is the CALLER's concern —
  the primitive is dumb chrome. Sticky/floating placement variant.
- A11y: `aria-live="polite"` on the count; Escape triggers onClear when focus is within.
- Evidence: neo's character-bulk-bar + message-selection-bar (same shape twice).
- Consumers: gallery curation multi-select, library bulk ops, message bulk-delete.

### 22. save-bar
`primitives/save-bar`. Sticky editor footer/header chrome: title + kind label left; right
side takes children (dirty indicator, discard, save).
- This is layout chrome ONLY — no form state, no dirty logic. The actual form wiring lives in
  the client form factories per ui-package-design §6.2, NOT here.
- Evidence: neo's character-save-bar + preset-save-bar are documented copies of each other
  ("Mirrors CharacterSaveBar's shape").
- Consumers: orbweaver's entity editors (character, preset, theme, rule, guide) all need it.

---

## C. PARKED — do not build

No committed consumer, needs upstream design, or adjudicated app-level:

- **table/data-grid** — no committed consumer (agent-principal's admin list may not need one).
- **CapabilityGrantList** — plugin install UX has no design pass yet; compose from
  checkbox/badge/popover at feature level when it does.
- **CrossfadeImage/RevealGate variants beyond the above, InitiativeStrip, FontPicker,
  theme-preview tile** — adjudicated app-level composition.
- **message-list, stream/ (useSmoothText), command (cmdk / omni-bar)** — deferred to their
  named chunks per ui-package-design §9; the macro-textarea port removes the last near-term
  pressure for a command palette.
- **resizable (react-resizable-panels)** — neo used it; D54 explicitly dropped it for
  orbweaver. If app-shell later needs split panes that's a ledger decision, not a carve.
- **reasoning-block, swipe-strip, composer internals** — chat-client chunk components, owned
  by the chat feature design, not @orb/ui.
- **corpus viz (stat-figure, bar-list, heatmaps, galaxy, similarity graph)** — the ECharts
  charts/ expansion is deferred to the corpus client chunk (D52) by design.
- **app-splash, route-error-fallback, weave-glyph, dialog-state-gate** — already adjudicated
  app-level in ui-package-design §12.
