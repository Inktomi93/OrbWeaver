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

Wire the macro diagnostics the parser already builds. MacroSpan and MacroDiagnostic carry code, message and position, and their headers promise an editor squiggle and a line in AssembleTrace. Prompt and macro bodies edit in MacroTextarea, a plain textarea, and only the regex and theme fields mount CodeEditor, so the diagnostics prop does not reach them. No prompt render path supplies a diagnostics sink, and AssembleTrace has no diagnostics field. Choose the editor route first: a mark layer inside MacroTextarea, CodeEditor on those fields, or a message list under the field. Then add the sink and the trace field. Owner ruling: wire it.

## Why

An unknown macro, a wrong argument or an unclosed block fails with nothing shown to the author.

## Done when

Typing an unknown macro shows a squiggle at its position in the editor, and the assembly trace lists it, with a CT and a test at the production entry.

## Evidence

Filled at landing: what ran and where its output is.
