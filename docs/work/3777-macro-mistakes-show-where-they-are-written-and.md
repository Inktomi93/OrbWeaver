---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: chat
plan: chat-html-and-presets
---

# Macro mistakes show where they are written and in the prompt inspector

## What

The macro evaluator in packages/kit/src/macro records MacroDiagnostic entries (unknown macro, bad arity, bad argument type, unclosed block, expression error) with a source span. Only automation's renderArmTemplate (packages/server/src/domain/automation/substrate/macro-render.ts) passes a sink, and it keeps only the first message. Chat assembly passes none, and no editor checks macros, so a mistyped macro renders silently. MacroArgDef.description in packages/kit/src/macro/types.ts is declared and no built-in macro fills it, and macro autocomplete shows only argument names (packages/client/src/lib/prompt-macros.ts).

## Why

A user cannot see that a macro in a prompt, card or persona did nothing.

## Done when

A check-only call over the kit evaluator returns diagnostics for a text; the prompt, card and persona editors mark each one at its span with its message; the turn's prompt inspector lists the diagnostics assembly met by code; no second macro parser exists; a kit test covers each code and a CT covers an editor mark. Built-in macro arguments carry descriptions and autocomplete shows them as hints inside a macro's arguments.

## Evidence

Filled at landing: what ran and where its output is.
