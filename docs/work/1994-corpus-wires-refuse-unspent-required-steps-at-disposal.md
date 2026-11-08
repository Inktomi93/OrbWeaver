---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-a05d401fe0a7ad9c7
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
