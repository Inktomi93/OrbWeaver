---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
---

# A display script's stylesheet prints as message text when it holds a blank line

## What

A display regex script can replace text with a `<style>` element that opens after another tag on its line, such as `<div><style>`, and whose CSS holds a blank line. The reply's block reading ends the HTML block at that blank line, so the rest of the stylesheet becomes a prose segment. Style removal then finds no opening tag in that segment, and the CSS prints as text, with `/* */` comment stars read as emphasis. The panel after the stylesheet still renders. The first outside user's preset has scripts of this shape. The block reading is `scanStyledHold` and `stripStyleElements` in `packages/kit/src/content/index.ts`, and the committed reply path under `packages/client/src/features/chat/` may share the fault.

## Why

The first outside user sees a wall of CSS above the panel her preset draws. SillyTavern shows only the panel.

## Done when

A `<style>` or `<script>` element is read as one unit to its closing tag wherever it opens on a line, blank lines included, on the forming reply and the committed reply. No stylesheet text reaches prose. A small synthetic fixture of the `<div><style>` shape with a blank line turns a test red before the fix, at the kit layer and through the committed reply's render. The trust rule for script-written markup is unchanged.

## Evidence

Filled at landing: what ran and where its output is.
