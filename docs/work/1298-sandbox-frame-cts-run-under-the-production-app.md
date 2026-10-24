---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tests
plan: test-foundation
---

# Sandbox-frame CTs run under the production app policy

## What

The sandbox-frame CTs capture the app CSP from a served response, but the CT stack serves the development variant (it allows unsafe-eval and ws:). Frame navigation directives are identical in both variants, so today's verdicts hold; a future directive that differs would go untested.

## Why

A security-boundary test should run against the policy owners actually get.

## Done when

The sandbox-frame navigation CTs run with the production variant of the app policy, read from the same served response path; a planted production-only directive change fails a case.

## Evidence

Filled at landing: what ran and where its output is.
