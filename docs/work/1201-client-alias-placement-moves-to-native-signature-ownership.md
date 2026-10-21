---
kind: work
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Client alias placement moves to native signature ownership

## What

After 981 the structure check reports client type-home findings, mostly aliases plus some interfaces; orb/type-home-direct-export does not yet admit client aliases. Only part of the aliases are signature-owned; the rest are wire-named data that stay judged.

## Why

One placement rule across packages: D331 signature ownership, with wire-named data judged everywhere.

## Done when

orb/type-home-direct-export admits client aliases by signature ownership with red-first rows; signature-owned client shapes stop flagging, wire-named ones are fixed at their homes, and the structure check shows no client type-home finding.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
