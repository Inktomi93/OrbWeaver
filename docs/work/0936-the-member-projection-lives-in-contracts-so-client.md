---
kind: work
status: open
updated: 2026-10-12
priority: P1
area: chat
plan: test-mirror
---

# The member projection lives in contracts so client tests stop importing server internals

## What

tests/client/features/chat/components/message-row\.ct.tsx imports packages/server/src/domain/chat/substrate/member-visibility.ts, a domain-feature-front-door finding that pnpm depcruise now reports since item 921 widened depcruise to cruise tests/client. Exporting projectViewForMember from the chat domain index does not work: the CT babel transform cannot load that index (declare fields in contract/errors.ts). Move the pure member projection (stripHiddenForMember, memberToolCalls, stripReasoningFromView, projectViewForMember) to @orb/contracts/chat so the server and the client test both import the one home. It is the member-strip trust boundary (Spine-Identity-and-Auth and the chat rules on member visibility), so a security-executor makes the move and proves no strip is weakened.

## Why

depcruise declines baselines, so this finding keeps main red; a test reaching into a server domain's substrate is the sideways import the cake forbids.

## Done when

The projection lives in contracts, the server domain and message-row\.ct.tsx import it from there, the member-visibility tests prove every strip still applies, and pnpm depcruise reports no finding.

## Evidence

Filled at landing: what ran and where its output is.
