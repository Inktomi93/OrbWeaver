---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: kit
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# Shapes cleanup in kit, ui and client: one home per repeated shape

## What

The shapes review (reports/unwired/shapes-judge.md, true findings) found repeated shapes: the half-open character range spelled Span, OpaqueRange, TextRange, ReadSpan and HiddenRun in packages/kit (HiddenRun's doc calls it a byte range but its producers use string indices); TailRow in composer-tail-line.ts restating the private WaitCountRow of packages/contracts/src/chat/metadata.ts; SCROLL_EDGE_EPSILON_PX re-exported through the scroll-area door instead of @orb/ui/lib; BoundColorFieldProps renaming BoundFieldShellProps; and contracts re-publishing kit's ParticipantRole, ParticipantKind and MessageKind. The ports review (reports/unwired/ports-judge.md) adds ParamsDeckProps in packages/client/src/features/preset/components/params-deck.tsx, which restates ParamsLimitsProps member for member and only forwards them to ParamsLimits.

## Why

Two spellings of one concept drift apart.

## Done when

Each concept has one home that every user imports, HiddenRun's doc says character range, and the affected suites and typecheck worlds pass.

## Evidence

Filled at landing: what ran and where its output is.
