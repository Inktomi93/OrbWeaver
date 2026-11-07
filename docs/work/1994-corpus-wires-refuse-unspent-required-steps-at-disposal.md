---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# Corpus wires refuse unspent required steps at disposal

## What

createCorpusRecipeExecution wires keep caller-side remaining checks. Each wire states whether its steps must all spend, and disposal refuses unspent required steps.

## Why

A reply plan that needs a remembered assertion is the defect finiteReplies closed for the other plans.

## Done when

No caller asserts remaining on a corpus wire, and an unspent required step fails at disposal.

## Evidence

Filled at landing: what ran and where its output is.
