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

Filled at landing: what ran and where its output is.
