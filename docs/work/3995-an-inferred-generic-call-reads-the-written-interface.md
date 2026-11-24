---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a871ed558acc11710
plan: unwired-code
---

# An inferred generic call reads the written interface reference of its argument

## What

A one-member tuple's element type is a bare literal with no alias, so an inferred generic call over a descriptor (RULE_PRESET_ENTITY_KINDS) reads an owner the checker cannot name, while the same descriptor in an annotated constant is credited; the fix needs a node-level descent in tooling/src/unwired/graph/slots.ts.

## Why

A one-member tuple built only through an inferred call reads unbuilt.

## Done when

The slot reader descends to the written interface reference at the argument node, the RULE_PRESET row is credited on the real tree, and a twin one-member tuple of the same text stays uncredited.

## Evidence

Filled at landing: what ran and where its output is.
