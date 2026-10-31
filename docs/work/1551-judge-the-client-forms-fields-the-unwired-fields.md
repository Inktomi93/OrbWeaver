---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/forms fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/forms`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AvatarUploadFieldProps.label` | `client/src/forms/editor/bound-fields/avatar-upload-field.tsx:20` | unreferenced | delete | delete the field |
| `AvatarUploadFieldProps.description` | `client/src/forms/editor/bound-fields/avatar-upload-field.tsx:21` | unreferenced | delete | delete the field |
| `BoundColorFieldProps.description` | `client/src/forms/editor/bound-fields/color-field.tsx:45` | never-read | delete | delete the field and its writes (`client/src/features/config/components/theme-editor.tsx:122`) |
| `BoundColorFieldProps.disabled` | `client/src/forms/editor/bound-fields/color-field.tsx:46` | unreferenced | delete | delete the field |
| `MacroFieldProps.label` | `client/src/forms/editor/bound-fields/macro-field.tsx:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroFieldProps.description` | `client/src/forms/editor/bound-fields/macro-field.tsx:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroFieldProps.hint` | `client/src/forms/editor/bound-fields/macro-field.tsx:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MultiToggleFieldProps.description` | `client/src/forms/editor/bound-fields/multi-toggle-field.tsx:17` | never-read | delete | delete the field and its writes (`client/src/features/regex/components/regex-editor-fields.tsx:208`) |
| `BoundNumberFieldProps.description` | `client/src/forms/editor/bound-fields/number-field.tsx:12` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BoundNumberFieldProps.hint` | `client/src/forms/editor/bound-fields/number-field.tsx:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BoundNumberFieldProps.disabled` | `client/src/forms/editor/bound-fields/number-field.tsx:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SegmentFieldProps.description` | `client/src/forms/editor/bound-fields/segment-field.tsx:17` | unreferenced | delete | delete the field |
| `SelectFieldProps.label` | `client/src/forms/editor/bound-fields/select-field.tsx:13` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SelectFieldProps.description` | `client/src/forms/editor/bound-fields/select-field.tsx:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SelectFieldProps.hint` | `client/src/forms/editor/bound-fields/select-field.tsx:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SelectFieldProps.disabled` | `client/src/forms/editor/bound-fields/select-field.tsx:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BoundSliderFieldProps.label` | `client/src/forms/editor/bound-fields/slider-field.tsx:14` | never-read | delete | delete the field and its writes (`client/src/features/app-shell/components/appearance-background-section.tsx:208`) |
| `BoundSliderFieldProps.description` | `client/src/forms/editor/bound-fields/slider-field.tsx:15` | unreferenced | delete | delete the field |
| `BoundSliderFieldProps.disabled` | `client/src/forms/editor/bound-fields/slider-field.tsx:19` | unreferenced | delete | delete the field |
| `TextFieldProps.label` | `client/src/forms/editor/bound-fields/text-field.tsx:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextFieldProps.description` | `client/src/forms/editor/bound-fields/text-field.tsx:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextFieldProps.hint` | `client/src/forms/editor/bound-fields/text-field.tsx:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextareaFieldProps.label` | `client/src/forms/editor/bound-fields/textarea-field.tsx:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextareaFieldProps.description` | `client/src/forms/editor/bound-fields/textarea-field.tsx:11` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextareaFieldProps.hint` | `client/src/forms/editor/bound-fields/textarea-field.tsx:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TextareaFieldProps.disabled` | `client/src/forms/editor/bound-fields/textarea-field.tsx:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
