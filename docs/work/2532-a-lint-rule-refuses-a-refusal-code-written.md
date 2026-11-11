---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: test-enforcement
---

# A lint rule refuses a refusal code written as a string literal at the throw

## What

The background-unavailable refusal code was spelled as a literal in three domains, and the plugin host-call verb threw bare Error objects that the transport answered as unknown faults. Both were found by reading. A native ESLint no-restricted-syntax entry can refuse, under packages/server/src/domain, a construction of a domain error class whose code argument is a string literal, and a throw of a bare Error in a file under a verbs or persistence directory.

## Why

A refusal code is wire vocabulary with one home in contracts, and a bare Error in a verb reaches the client as a server fault. Both rules are checkable at the declaration.

## Done when

A census counts both shapes by domain with a structural search. The literal codes move to their contracts constants by codemod where the shape is mechanical. Bare throws in verbs are each judged: a refusal becomes a coded domain error, an invariant becomes the internal-fault base. Both entries then mount at zero with planted tests.

## Evidence

Filled at landing: what ran and where its output is.
