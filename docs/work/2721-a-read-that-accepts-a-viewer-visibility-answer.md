---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# A read that accepts a viewer visibility answer as a parameter runs the identity and chat check

## What

Every chat, rpg, search, discovery and automation read resolves its own viewer visibility answer through the injected op, for its own chat, and takes none from outside. The one function that accepts an answer as a parameter, `loadPluginMessages`, runs the identity and chat check. Nothing stops a new read from accepting an answer as a parameter and skipping the check.

## Why

The rule holds today by construction and review, and a new parameter would open the cross-room read again with every test green.

## Done when

A type or a lint rule refuses a function that takes a viewer visibility answer as a parameter without running the check, with a planted control, on at zero.

## Evidence

Filled at landing: what ran and where its output is.
