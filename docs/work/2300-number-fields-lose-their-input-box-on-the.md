---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a88fe4fa1ec4fa014
plan: cross-surface-consistency
---

# Number fields lose their input box on the phone at enlarged text

## What

On the phone at enlarged text a number field's input renders with no visible box: the World Info entry Depth field at 200% and 300%, and the Library Rows per page field at 300%.

## Why

The value cannot be read or edited at enlarged text.

## Done when

Depth and Rows per page are visible and editable at 200% and 300% on chromium-phone-portrait; Config independent category worldInfo and Config reversible settings pass there.

## Evidence

Part, in 9ae6688618 (awaiting merge): the NumberField input keeps one control width beside its steppers, where it collapsed to 11px at 200% and 0px at 300%. Ruling (claude-b under delegation): the two-field row reflows by letting its call-site Row wrap (the Depth and Role row in entry-editor.tsx), because the field itself is sound and hiding steppers costs touch users their buttons. Remaining: that Row wraps, with a CT at the phone width.

Part 2, in 820ce8dc84: the World Info Depth and Role row, header row and switch row wrap; CT red on main, green after. Ruling (claude-b under delegation): at 300% the stepped NumberField is itself wider than the phone column, so below the narrow container step it moves its steppers onto a line under the input, keeping the buttons for touch. Remaining: build that with a CT.
