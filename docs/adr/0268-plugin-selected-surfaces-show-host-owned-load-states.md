---
kind: adr
status: active
updated: 2026-09-28
---

# Selected plugin surfaces show host owned load states

## Context

A selected extension page or open plugin dialog occupies host chrome before its catalog and scripted guest settle. Silence makes loading, failure, and confirmed absence indistinguishable.

## Decision

Selected extension pages and open plugin dialogs show host owned booting, ready empty, ready content, and failed states. Failed states provide Retry. Catalog reads show pending and failed states before the host confirms removal. Optional anchors remain silent without content. Tool cards retain their canonical fallback. Homes are `packages/client/src/features/plugin/` and `tests/client/features/plugin/`.

## Consequences

The plugin guest host reports successful readiness separately from tree publication. A guest may become ready without publishing a tree. The host keeps attribution visible throughout each selected or open state.

## Alternatives rejected

Treating no tree as absence hides failures and strands people on blank selected surfaces. Showing state chrome at optional anchors adds empty plugin UI where the host has valid content without it.
