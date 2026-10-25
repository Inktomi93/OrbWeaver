---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: client
plan: css-system
---

# Client globals.css is organized one block per layer with each skin in its home

## What

packages/client/src/styles/globals.css splits three layers into seven @layer blocks; @variant appearance-blur-surfaces-panels and -modals wrap one rule each (the codemod's shape); the glass filter blur(calc(var(--appearance-blur-strength) \* 1px)) saturate(var(--blur-saturate)) is spelled six times plus a halved copy; the theme colorization rule declares the same tokens twice; the absolute pseudo carrier is hand-spelled four times. Component skins live in client globals: the message-list edge-fade mask and the Streamdown code-block rules skin @orb/ui parts, and the brand wordmark halo is a component skin. shell.css:2 cites Biome noDescendingSpecificity, which no longer applies.

## Why

The paint law gives each skin one home and the sheet should read one layer at a time; the drift came from successive lanes and hides what each layer owns.

## Done when

Each sheet has one block per layer in layer order; each variant wraps its rules once; the glass filter is one custom property; the message-list fade and Streamdown code-block rules live in the ui styles and the wordmark halo is a component variant; the stale comment is fixed; a stylelint rule refuses a second @layer block of the same name in one file, with a planted control; a capture set at 1440 and 390 shows no visual change.

## Evidence

Filled at landing: what ran and where its output is.
