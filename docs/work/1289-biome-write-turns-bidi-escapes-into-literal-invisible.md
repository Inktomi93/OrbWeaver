---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tooling
---

# Biome --write turns bidi escapes into literal invisible characters

## What

A scoped `biome check --write` in the 1278 lane rewrote `\u202E`/`\u202C` escapes in a test string into the literal invisible bidi characters; the lane rebuilt those strings from code points. Other files may already carry literal bidi or control code points from earlier --write runs.

## Why

Literal bidi controls in reviewed source are the trojan-source hazard: the code a reviewer reads is not the code that runs.

## Done when

The Biome rule or formatter option that unescapes them is identified and configured to keep control and bidi code points escaped, or a gate rejects literal bidi and C0/C1 control code points in tracked source; a sweep of the tree reports none (or each is fixed); a planted literal fails the gate.

## Evidence

Filled at landing: what ran and where its output is.
