---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: tests
plan: checked-law
---

# The test authoring checklist loads by path for every test file, and each package area has a path rule

## What

The test rules under .claude/rules load by path, but they only link to the testkit authoring contract in tests/support/README.md; the authoring checklist itself is not loaded, so an author who skips the link never sees it. Their globs also miss files tests are built from: type tests with the test-d suffix, and the story and helper files that sit beside component tests outside tests/support. Among the packages, default-content has no path rule, and the server domains other than chat, plugin and rpg share one general server rule although the reviews found domain-specific rulings broken in import, character, discovery, embeddings and connection. Whether a rule loads when a file is created and not read first is not verified.

## Why

The test tree is being rebuilt by cold authors, and its rules carry the most nuance in the repo. A rule that loads by path reaches every author; a link reaches the ones who follow it.

## Done when

The authoring checklist has one home in a path rule that loads for every file under tests, with the README linking to it and keeping the longer contract. The test rule globs cover type tests, stories and helpers, confirmed by listing tracked test files that match no rule. Each package and each server domain where a review found a domain ruling broken has a path rule holding its rulings, each written from the domain's law and file headers and listed in AGENTS.md with its globs. A probe shows whether a rule loads on file creation, and the result is recorded in the writing rule. The law census covers the new rule files.

## Evidence

Filled at landing: what ran and where its output is.
