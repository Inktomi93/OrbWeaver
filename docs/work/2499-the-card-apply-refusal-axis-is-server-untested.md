---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: testing
lane: wt/agent-a06d7ca7c655446af
---

# The card-apply refusal axis is server-untested — eight of nine refusal reasons are never asserted

## What

The terminal rewrite-apply verbs classify every user accept into one applied outcome or one of nine typed refusal reasons: missing slot pointer, invalid slot pointer, pointer on the wrong field, outside the session selection, structure deleted under the session, the last greeting refusing removal, the greeting ceiling, and the merge-conflict refusal for a card edited under the session, which the user overrides by explicit re-confirmation. The refusal code is all present and verified true against its governing workspace ruling at the line. But a whole-tree assertion census finds the string of exactly one of the nine reasons anywhere in the server test tree; the other eight appear zero times. The only test that displays refusal reasons at all is a client component test rendering a stubbed refusal copy map — it pins the copy, never the classification. The apply-side integration suite exercises the happy paths, the lineage pins, and one refusal reason.

## Why

This is the destructive terminal act of the whole authoring flow: it writes the live card and refuses atomically with itemized reasons the surface renders as typed copy. Every refusal rule that the code implements and no server test asserts is a rule a refactor can silently widen or narrow — the merge-conflict override is the most dangerous of the nine, because a regression there silently overwrites edits the user made outside the session.

## Done when

Server tests assert each of the nine refusal reasons end-to-end through the apply verbs, including the merge-conflict refusal and its re-confirmed pass, and the greeting-budget refusals at the exact ceiling and floor; the client copy-map test keeps pinning only the copy.

## Evidence

Filled at landing: what ran and where its output is.
