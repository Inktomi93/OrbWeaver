---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
---

# A failed document upload tells the user what went wrong in plain words

## What

When extraction fails, the databank upload answers the sentence `extraction failed for format: docx`, and the client shows it as the upload error. A document that is too large once unpacked gets the same sentence, with no hint that size is the cause. The server already distinguishes the cases by code and cause.

## Why

The user cannot tell a damaged file from one that is too big, and the wording is the operator's, not the product's.

## Done when

The upload surface shows a product sentence for a damaged file and a different one for a file over the size budget, each from a zero-import copy module, keyed on the server's code and not on its message text. A component test shows both.

## Evidence

Filled at landing: what ran and where its output is.
