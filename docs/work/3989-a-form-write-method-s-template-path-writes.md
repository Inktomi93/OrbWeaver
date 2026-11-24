---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a871ed558acc11710
plan: unwired-code
---

# A form write method's template path writes the member it names

## What

The graph resolves a form field component's string name through the form's value type, but a template path handed to a form write method such as setFieldValue is not resolved, so the member it writes reads unwritten.

## Why

A member written only through a form write method can report read-only, a false ask.

## Done when

A literal or template path passed to a form write method resolves through the form's value type and writes the named member, a planted case is red without it, and a path naming a member the type lacks writes nothing.

## Evidence

Filled at landing: what ran and where its output is.
