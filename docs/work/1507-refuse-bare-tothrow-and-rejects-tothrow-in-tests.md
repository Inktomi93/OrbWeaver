---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Refuse bare toThrow and rejects.toThrow in tests

## What

An ESLint rule over tests/\*\* that reports toThrow() with no argument, toThrow(Error) and rejects.toThrow() with no class, code or matcher, pointing at the production error class, toThrowTRPCError or toMatchObject({ code }).

## Why

A bare refusal passes on an unrelated ENOENT or TypeError, so it never proves the reason.

## Done when

The rule refuses a planted bare refusal and accepts a typed one; the existing sites are fixed (a codemod where the class is mechanical); it reports zero over tests/.

## Evidence

Filled at landing: what ran and where its output is.
