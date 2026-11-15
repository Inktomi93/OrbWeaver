---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# The role comparison rule sees a narrowed role type and proves its programs resolve the role types

## What

A value typed as a narrowed role, such as `Exclude<UserRole, "owner">`, compared to a literal lints clean under `orb/no-role-comparison`. The rule also switches itself off in a program that never loads the identity contracts. Treat a subset of the role union as a role, and add a test row that the server and client programs resolve both role types.

## Why

A narrowed role is still a role, and a rule that goes quiet when a file moves reads as a clean tree.

## Done when

A narrowed-role comparison is refused in the rule test, and a test fails when the server or client program stops resolving the role types.

## Evidence

Filled at landing: what ran and where its output is.
