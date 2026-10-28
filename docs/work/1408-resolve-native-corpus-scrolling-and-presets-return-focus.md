---
kind: work
status: doing
updated: 2026-10-28
priority: P2
area: client
lane: chat_deep_coverage
plan: surface-walk
---

# Resolve native Corpus scrolling and Presets return-focus failures

## What

Diagnose the native Corpus context-panel scroll refusal and Presets Edit Response return-focus failure. Distinguish product defects from driver errors before changing behavior.

## Why

These failures prevent completion of the production-backed surface journeys and leave keyboard and scroll behavior unqualified.

## Done when

Identify each cause, repair its owning implementation, and pass affected Chromium and WebKit journeys without weaker assertions or synthetic scroll substitution.

## Evidence

Filled at landing: what ran and where its output is.
