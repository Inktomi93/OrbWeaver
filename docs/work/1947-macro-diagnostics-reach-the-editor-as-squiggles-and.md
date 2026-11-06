---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: kit
plan: unwired-code
---

# Macro diagnostics reach the editor as squiggles and the assembly trace

## What

Wire the macro diagnostics the parser already builds. MacroSpan and MacroDiagnostic carry code, message and position, and their headers promise an editor squiggle and a line in AssembleTrace. Prompt and macro bodies edit in MacroTextarea, a hand-rolled combobox on a plain textarea, reached directly and through MacroField from presets, characters, personas, automation rules and more. Rebuild MacroTextarea on CodeEditor, keeping its name and props, so diagnostics, marks and completion come from one editor and the hand-rolled popover goes. Prove phone input and page load across those surfaces first; if phones fail, show a message list under the field instead. Add a diagnostics sink to the prompt render path, feeding the macro slice of AssembleTrace. Owner ruling: wire it.

## Why

An unknown macro, a wrong argument or an unclosed block fails with nothing shown to the author.

## Done when

Typing an unknown macro shows a squiggle at its position in the editor, and the assembly trace lists it, with a CT and a test at the production entry.

## Evidence

Filled at landing: what ran and where its output is.
