---
kind: work
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# A panel the model writes itself draws in its row's card frame

## What

A reply draws in its row's sandboxed frame only when a display script's template styled it (D354). A panel the model writes as raw HTML with no card marker goes to the inline sanitizer, which drops its styles, scripts and inline SVG. Presets and extensions written for SillyTavern have the model write such panels in the middle of a reply. The frame's Markdown render also parses Markdown again after a blank line inside a block element, so a panel of several paragraphs can show its tags as code.

## Why

The outside user's presets and common RPG prompts produce this shape, and it draws unstyled or broken.

## Done when

On a row whose tier is the sandboxed one, prose outside card blocks that holds a real style element, a real script element, an HTML block whose tag carries a style attribute, or a real svg element frames as a script-styled reply does, under the same gate, policy, budgets and notice. Inline-only markup, a bare tag and a code sample never frame. The forming row holds such a panel behind the chip. The frame render holds a block element whole. A speaker tag or name label inside a panel does not split it. D354 states the rule. Component tests cover each shape, and a security review has passed.

## Evidence

Filled at landing: what ran and where its output is.
