---
kind: bug
status: open
updated: 2026-11-26
priority: P3
area: client
---

# Effect-time focus after a door or request is checked for the inert-panel and late-arrival losses

## What

Three effects focus a control after a request or door with a plain focus() call: regex-row-anchor.tsx, connections-list-section.tsx and run-controls-card.tsx under packages/client/src/features. The Trust door lost focus to both a request consumed under a closed, inert panel and a later surface's arrival focus; these were not examined for either.

## Why

A door that focuses nothing on a slow machine or on a second use leaves a keyboard or screen-reader user at the top of the page.

## Done when

Each site is checked for both losses; a site that has one lands focus through landFocus or commits its request with the reveal, with a CT red on the old order, and a site that has neither is recorded with the reason.

## Evidence

Filled at landing: what ran and where its output is.
