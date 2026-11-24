---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a928fb0eea0de1b10
plan: unwired-code
---

# The literal search finds a member whose name is not a single word

## What

searchLiterals in tooling/src/unwired/literal-hits.ts refuses a name that is not a single word, such as a quoted content-type key. The trial then notes the row as unsearched and keeps it confirmed, and the fields stage moves such a dead row to ask without a search.

## Why

A row whose name is not a word gets no literal evidence at all. An escaped pattern can search it on both the git grep pass and the JavaScript pass.

## Done when

An escaped pattern searches a member whose name is not a word on both passes. A planted quoted-key read off the owner holds a trial row. The stage's unsearchable path covers only what the escape cannot express. The ruling in the literal-hits header is updated in the same change.

## Evidence

Filled at landing: what ran and where its output is.
