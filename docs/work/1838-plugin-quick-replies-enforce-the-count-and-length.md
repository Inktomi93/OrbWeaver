---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: security
---

# Plugin quick replies enforce the count and length caps rule-authored chips have

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
Plugin quick replies have no caps. `packages/server/src/infra/plugin-host/membrane.ts` says the count and length caps live in the domain op, but `createPluginFeedbackOps.surfaceQuickReply` has none. The 4 choices, 80-char label and 2048-char limits apply only to rule-authored chips. A host-authority guest can push about 1 MiB of chips to members. Done: caps enforced for the plugin emitter, or the comment corrected by a ruling.

