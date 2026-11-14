---
kind: decision
status: open
updated: 2026-11-14
priority: P1
area: security
---

# Rule on how panels drawn by a user's own preset get their styling

## What

Display regex output that carries `<style>` blocks and inline styles meets the default inert allowlist in `packages/client/src/lib/render-trust.ts`, which strips both. The styled tier there has two consents today (D44): the author is trusted (the viewer's own input, or a character at or above trusted), or the room turned on immersive cards. Neither names a preset the user imported. Decide which consent lets such a preset draw styled HTML, and whether it renders in the main DOM or the sandboxed card frame. The Sola file's replacements hold style blocks, inline styles, keyframes and SVG, with no script element and no event handler. Route the work to security-builder.

## Why

Preset-drawn HUDs depend on their CSS, and a per-character trust setting is the wrong control for content the user's own preset produces.

## Done when

A ruling names the consent and the render tier, and a follow-up work item is boarded for it.

## Evidence

Filled at landing: what ran and where its output is.
