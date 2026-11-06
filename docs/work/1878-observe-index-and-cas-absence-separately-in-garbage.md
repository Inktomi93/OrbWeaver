---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: testing
plan: test-foundation
---

# Observe index and CAS absence separately in garbage-collection tests

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0011`: Strengthen existing negative GC observations to assert missing index row and missing owner/hash blob independently, preserving current positive retention and exact export-byte controls.

## Why

`AF3-TSSEC-Q0011`: The shared survives predicate returns false as soon as the row disappears, so it cannot detect a retained physical blob after row-only deletion.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0011`: A row-only deletion control fails the reclamation assertions; healthy GC removes both stores and positive retained references remain present. Focused native tests remain owed; no actual leak claimed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
