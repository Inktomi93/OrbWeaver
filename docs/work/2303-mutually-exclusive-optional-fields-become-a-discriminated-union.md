---
kind: tooling
status: doing
updated: 2026-11-10
priority: P2
area: tooling
lane: wt/agent-a8de7b4cdde0d7872
plan: type-law
---

# Mutually exclusive optional fields become a discriminated union by rule

## What

Object types whose optional fields are never set together at any construction site (for example a bag of a?: X and b?: Y where only one is ever given) should be a discriminated union or a key-presence XOR, as Card cap or artDecoration, Text receded or unpainted and the mutation factory's failure classes were closed by hand. Outside tv() recipes, which recipe-erasure covers, no rule finds them. Use the unwired scanner's construction evidence to list such types, judge each list row, close the real ones by type, and turn a rule on at zero for new ones.

## Why

A combination the type allows but the code never means is a state a later author can build by mistake; the compiler should refuse it instead of review finding it.

## Done when

The scan lists every object type whose optional fields are never co-set at construction, each row is closed by type or kept with a cited reason, and a lint rule or test fails on a new such type, cross-checked on the real tree with a positive control. Companion to 1800 (closed vocabularies).

## Evidence

Filled at landing: what ran and where its output is.
