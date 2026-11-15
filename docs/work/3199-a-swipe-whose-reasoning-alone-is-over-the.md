---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: import-robustness
---

# A swipe whose reasoning alone is over the cap keeps its text

## What

The stored message cap refuses a variant whole when either its content or its reasoning is over the bound. A swipe with ordinary text and over-long reasoning loses both.

## Why

The reply text is what the user reads; the reasoning is secondary and could be dropped alone.

## Done when

A recorded ruling says whether an over-long reasoning drops only the reasoning, and the import and commit doors follow it with a case each.

## Evidence

Filled at landing: what ran and where its output is.
