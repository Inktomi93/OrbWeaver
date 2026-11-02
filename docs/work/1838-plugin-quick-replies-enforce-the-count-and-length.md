---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: security
---

# Plugin quick replies enforce the count and length caps rule-authored chips have

## What

The plugin quick-reply emitter refuses more than `QUICK_REPLY_MAX_CHOICES` choices, a label over `QUICK_REPLY_LABEL_MAX` characters, or a text over `QUICK_REPLY_SEND_MAX` characters. The caps are the rule chips' own constants, exported from `packages/contracts/src/automation/index.ts`.

## Why

`createPluginFeedbackOps.surfaceQuickReply` in `packages/server/src/domain/automation/verbs/plugin-feedback.ts` had no caps, though `packages/server/src/infra/plugin-host/membrane.ts` said the domain op held them. A host-authority guest could push about 1 MiB of chip text to every member of the room.

## Done when

A guest's over-count, over-long label and over-long text calls refuse and surface nothing. A call at every cap surfaces its chips unchanged. The membrane comment names the enforcing op.

## Evidence

`tests/server/infra/plugin-host/bridge-call-parsing.int.test.ts`, case "a guest's quick replies stop at the count and length caps a rule's chips have". It drives the real guest, broker and bridge, and reads the room's automation stream. On the old source the five-choice call returned `ok: true`. It passes after the fix.
