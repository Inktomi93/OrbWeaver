---
kind: bug
status: doing
updated: 2026-10-07
priority: P2
area: tooling
lane: codex/ci-dependency-upgrade
---

# Keep test startup warnings observable without Node storage side effects

## What

Repair the invalid CSS fixture and classify vendor annotation warnings precisely. Disable Node Web Storage at test process boundaries while preserving browser storage.

## Why

Startup warnings obscure failures. Node storage probing emits warnings in test processes that have no storage file.

## Done when

Affected fixture and warning-handler controls pass. Native test processes retain heap and lifecycle settings without Web Storage globals. Browser persistence remains functional and focused startup logs contain no identified warnings.

## Evidence

Affected process environment, warning-handler and CSS fixture controls pass. Browser persistence checks pass with Node Web Storage globals absent. Focused CT startup has no identified storage, annotation or output-directory warnings.

Heap options, lifecycle markers and browser storage remain intact. Unfamiliar warnings still propagate.
