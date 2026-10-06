---
kind: bug
status: open
updated: 2026-10-06
priority: P2
area: security
---

# Fix or dismiss the open CodeQL alerts

## What

CodeQL security-extended reports 12 open alerts outside tests: request forgery in tooling/src/snap/ops/materialize-devtools.ts:78 (critical); tainted format strings in packages/client/src/lib/long-task-tracer.ts (199, 208, 238, 250); polynomial ReDoS in packages/client/src/lib/download-json.ts:76 and packages/ui/src/tokens/index.ts:304; incomplete sanitization in packages/server/src/domain/character/substrate/embed-text.ts:31 and tooling/src/verify/ops/gen/active-gates-index.ts:131; bad code sanitization in packages/server/src/entry/http/plugin-frame.ts:163 and tooling/src/cpu-profile/ops/boot-trace.ts:192.

## Why

The repository is public and the Security tab shows these to anyone; plugin-frame.ts and embed-text.ts sit on product trust boundaries.

## Done when

Each alert is fixed in code, or dismissed in GitHub code scanning with a reason that cites the code showing it is unreachable or harmless; the Security tab shows no open CodeQL alerts.

## Evidence

Filled at landing: what ran and where its output is.
