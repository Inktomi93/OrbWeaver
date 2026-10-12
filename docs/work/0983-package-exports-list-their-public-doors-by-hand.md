---
kind: work
status: doing
updated: 2026-10-12
priority: P1
lane: wt/agent-a528ae9e8798cd571
plan: test-foundation
---

# Package exports list their public doors by hand

## What

D318: replace the wildcard exports map in kit, contracts, db, server and client with an explicit list of the doors production packages import, generated from the real cross-package imports in production source. Legacy tests that import a deep `@orb/<package>/<path>` move to the existing root raw-reach form (`#<package>/<path>`, granted under `tests-raw-package-reach`) and leave with their files when the rebuild replaces them; rebuilt tests enter through public entries and `@orb/testkit` only, per Core-0 section 5. No transitional testing door is added. Point knip at the declared exports with tests outside the production run, and baseline today's findings shrink-only for adjudication by area. Test-only exports knip will report once exports are listed, to delete or give a caller: the macro validateMacroArgs wrapper, the theme-derivation proof helpers oklabToOklch and derivedMutedForegroundLightness, DEFAULT_EMBED_MODEL, and the default-content and showcase-plugins export surface.

## Why

The wildcard made every folder importable from any package and hid dead code from every tool; a declared surface lets the resolver and knip enforce it with no custom tooling.

## Done when

No package exports map carries a wildcard; an undeclared cross-package path fails to resolve; no test imports a deep `@orb/<package>/<path>`; knip's production run reports unused declared exports against a shrink-only baseline; Core-0 section 2 states the rule.

## Evidence

Filled at landing: what ran and where its output is.
