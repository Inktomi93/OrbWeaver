---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# E2E harness and doc follow-ups from the env hygiene review

## What

Bundle: tests/e2e/corpus-shared.local.spec.ts has no skip guard for a run with no corpus, unlike its siblings. The runner collection test never loads globalSetup or the reporters. docs/law/container-deployment-security.md still describes the old explicit secret list. A non-secret name that matches the credential pattern is dropped from a child env with no notice, an ambient HF_TOKEN among them.

## Why

Each is a small gap the env hygiene review found around the new guards.

## Done when

Each finding is fixed, or answered with a cited reason in this item's Evidence; the law text states the pattern rule.

## Evidence

Filled at landing: what ran and where its output is.
