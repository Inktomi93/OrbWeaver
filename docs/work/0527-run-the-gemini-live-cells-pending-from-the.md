---
kind: work
status: open
updated: 2026-10-07
priority: P2
area: inference
---

# Run the Gemini live cells pending from the launch inference matrices

## What

The Gemini probe key hit its free-tier daily quota during the launch live matrices, so Gemini native and Gemini compat (Custom) cells were not run for the Smart arbiter (scripts/probes/smart-picker-live, item 0492) and the RPG structured round (scripts/probes/rpg-structured-live, item 0511). Run those cells on main with GEMINI_PROBE_KEY after the quota resets and append them to each RESULTS.md.

## Why

Owner: merge without waiting for the quota; Gemini still needs live proof.

## Done when

Both probes' RESULTS.md carry Gemini native and compat rows on main; any failure is filed with file:line.

## Evidence

Filled at landing: what ran and where its output is.
