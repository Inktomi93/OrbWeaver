---
kind: work
status: blocked
updated: 2026-10-05
priority: P3
area: inference
blocked: owner
---

# Add native Gemini managed cached-content resources

## What

Implement opt-in native Gemini cached-content resources through existing inference and connection owners. Preserve exact prepared prompts, reusable prefix boundaries, credential authority, finite retention and truthful resource outcomes.

## Why

Automatic implicit caching satisfies the alpha scope. Managed resources require separate creation, retention, authority and cleanup work.

## Done when

The owner approves implementation. Behavioral checks prove stable-prefix reuse, changed-input refusal, owner and credential isolation, expiry, uncertain creation and cleanup. Resource metadata remains separate from reported generation billing. Applicable rendered and repository checks pass. Independent reviews clear required findings.

## Evidence

Filled at landing: what ran and where its output is.
