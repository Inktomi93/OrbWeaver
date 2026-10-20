---
kind: work
status: open
updated: 2026-10-20
priority: P3
area: security
---

# Type the remaining plugin sandbox ids as SandboxWireId

## What

Some sandbox-wire id fields in positions not named for a brand are still bare string; the plugins rule now says every id crossing the sandbox uses SandboxWireId<Brand>, but brand-in-name-position checks only brand-named positions.

## Why

An id crossing the plugin sandbox should state its brand and that it is unvalidated, wherever it sits.

## Done when

Every id in contracts/plugin that crosses the sandbox uses SandboxWireId<Brand>, with the rule or a test proving no bare-string sandbox id remains.

## Evidence

Filled at landing: what ran and where its output is.
