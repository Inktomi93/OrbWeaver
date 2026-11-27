---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
plan: unwired-code
---

# Refusal-code tests and comments after the client codes cleanup are exact

## What

Review of the client codes cleanup (3835, 3836, 3850, 3851, 3852) found: six new CTs take their expected copy from the function under test, so swapped copy for a code passes (room-failed-notice.ct.tsx, share-ip-certificate-failure.ct.tsx and siblings); the connection editor CT does not prove model, label and baseUrl refusals land on their own field (connection-editor-refusals.ct.tsx); the refusal-reason contract test covers only CONNECTION_OP_CODES for completeness and hard-codes the server literal invalid_params; the IP certificate CT does not cover expired; stale comments name getAppSettings (system-config-sections.tsx, media-trust-section.tsx), the renamed unlessEmbedRefusal (connection-editor.tsx) and the old PickedLine behavior (model-picker.tsx).

## Why

A test that reads its expectation from the code under test cannot catch wrong copy, a vocabulary left out of REFUSAL_REASONS reads as null on the client unnoticed, and comments that name removed code mislead the next author.

## Done when

Each listed CT asserts against an independent expectation per code and goes red on swapped copy; the editor CT places each field refusal on its field; the completeness test covers every vocabulary REFUSAL_REASONS spreads and imports the server code instead of a literal; expired has a case; the four comments match the code.

## Evidence

Filled at landing: what ran and where its output is.
