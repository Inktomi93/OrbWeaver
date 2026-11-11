---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a30ee1d42d1997dfe
---

# host.ts cites an Open-decisions ruling the law section never made

## What

packages/server/src/infra/auth/host.ts:6 justifies keeping normalizeHost infra-local by citing docs/law/Tier-3-Infra.md "Open decisions" as the ruling home. That section holds exactly two bullets (the CIDR matcher and safeFetch); no law or ADR doc mentions normalizeHost or host normalization at all (rg over docs/law/ and docs/adr/, rc=1 unpiped). A dead-door cite of the kit-unit class: prose shaped like a ruling pointing at a section that never ruled it. Source: reports/codebase-review/units/server-infra-core.md F2.

## Why

A cold author trusts a law cite and skips the placement reasoning; when the cite resolves to nothing, the ruling reads as invented and the placement decision is open to re-litigation.

## Done when

The header cites nothing it cannot show: drop the law citation and state the reason inline — pure host normalization is a kit/net candidate, kept infra-local while every consumer is infra, and the package-dependency rule is the door that forces the move when a client needs it.

## Evidence

Filled at landing: what ran and where its output is.
