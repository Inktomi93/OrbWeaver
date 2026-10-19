---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# respell --near takes hours of single-core CPU over the whole tree

## What

pnpm ast respell --near 60 --json over the whole tree on unmodified main runs more than three hours of single-core CPU at about 10 GB RSS (measured on 1f2db7d850 and bab35f87d4). Likely the near tier's pairwise checker calls.

## Why

It cannot finish on a standard CI runner or a modest box (965), and it blocks every respell before/after comparison a shared-reader item needs.

## Done when

The cost is profiled to its cause, and the near tier is bounded under D328 with no hidden population cut, unsupported pairs reported explicitly; the whole-tree run completes in a measured, recorded time and peak under 16 GB.

## Evidence

Filled at landing: what ran and where its output is.
