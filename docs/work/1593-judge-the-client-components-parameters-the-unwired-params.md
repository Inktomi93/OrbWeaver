---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/components parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/components`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BackgroundSourceField.#0.readOnly` | `client/src/components/background-source-field.tsx:76` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `CharacterPicker.props.leadingGroup` | `client/src/components/character-picker.tsx:98` | unsupplied-prop | delete | delete the prop and its default path (11 calls) |
| `EntryListEditor.#0.removeDescription` | `client/src/components/entry-list-editor.tsx:46` | unsupplied-prop | delete (read) | no editor sets a remove description: delete the prop and the dialog's description slot use |
| `EntryListEditor.#0.renderRowAction` | `client/src/components/entry-list-editor.tsx:46` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `FormSubmitButton.#0.cancelLabel` | `client/src/components/form-dialog.tsx:213` | unsupplied-prop | delete | delete the prop and its default path (5 calls) |
| `TagPickerDialog.#0.placeholder` | `client/src/components/tag-picker-dialog.tsx:54` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Six rows: six applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `BackgroundSourceField.#0.readOnly` | applied: prop, the inert `onPick: null` branch and the `readOnly` branches removed in `packages/client/src/components/background-source-field.tsx` |
| `CharacterPicker.props.leadingGroup` | applied: prop, destructure and render slot removed in `packages/client/src/components/character-picker.tsx` |
| `EntryListEditor.#0.removeDescription` | applied: prop and the confirm description slot removed in `packages/client/src/components/entry-list-editor.tsx` |
| `EntryListEditor.#0.renderRowAction` | applied: prop and its render slot removed in the same file |
| `FormSubmitButton.#0.cancelLabel` | applied: prop removed, label inlined as `Cancel` in `packages/client/src/components/form-dialog.tsx` (the separate `FormDialogSubmit.cancelLabel` and `ConfirmDialog.cancelLabel` are other props and stay) |
| `TagPickerDialog.#0.placeholder` | applied: prop removed, literal inlined in `packages/client/src/components/tag-picker-dialog.tsx` |

Survey: `codegraph_explore` on the six component symbols; `ast-grep` JSX scans for `BackgroundSourceField`, `CharacterPicker`, `EntryListEditor`, `FormSubmitButton`, `TagPickerDialog` over `packages tests tooling scripts` with `-l tsx` and `-l ts`, no spread or `Pick`/`Omit` wrapper supplies any removed name. Literal `rg` for each removed name across the same roots: only the definition files and one comment hit (`new-chat-picker-surface.tsx` mentions `leadingGroup` in prose).

Proof: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` client program clean. CT `entry-list-consent`, `platform-form-dialog.suite`, `platform-tag-pill-height.suite` render the edited components: 4 passed. No CT mounts `BackgroundSourceField` or `CharacterPicker`; typecheck covers them.
