---
kind: bug
status: doing
updated: 2026-11-25
priority: P2
area: security
lane: wt/agent-a2085b9ffc1754752
---

# A plugin upgrade that turns on matchAutomationEvents or adds provider rows asks for re-consent

## What

packages/server/src/domain/plugin/verbs/upgrade.ts decides widened from new capabilities and new netHosts only, so an enabled plugin whose new version sets matchAutomationEvents or declares new providers reactivates with no re-consent; activation reads both fields (activate.ts) and the consent card shows neither.

## Why

.claude/rules/plugins.md: a capability whose reach a manifest field sets can widen on upgrade and is enforced against what the owner consented to; automation-caused facts would reach handlers the owner never approved.

## Done when

An upgrade that turns matchAutomationEvents on or adds provider rows counts as widened and waits for re-consent, the consent card names both, with a case per field red on the current tree and a twin upgrade that changes neither and still reactivates.

## Evidence

Filled at landing: what ran and where its output is.
