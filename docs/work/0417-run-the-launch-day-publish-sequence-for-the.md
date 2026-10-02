---
kind: work
status: blocked
updated: 2026-10-02
priority: P1
area: launch
blocked: owner
---

# Run the launch-day publish sequence for the repo, SDK release, template repos and wiki

## What

Prepare and execute the owner-approved launch sequence for repository visibility, SDK release, starter repositories, wiki and storefront updates. Coordinate existing release and template items rather than duplicating them.

## Why

Public starters and documentation must not point at inaccessible dependencies or pages.

## Done when

Keep publication blocked until explicit owner authorization. Then verify release downloads, clean starter installs and public wiki links from an unauthenticated context. Retain existing SDK and template acceptance.

## Evidence

Delegated source audit: `/tmp/claude-launch-punchlist/items.json`, proposal `27`. The report contains exact source paths, coupled tests and independent skeptic findings. Runtime and implementation acceptance remain required.
