---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# The sideEffects ruling in the tooling rule matches the manifests and the client test

## What

The tooling path rule says every new workspace package declares sideEffects at birth. The client, db and server manifests declare none, and tests/client/package-effects.test.ts asserts the client manifest must not declare it.

## Why

A rule and a test that disagree leave a cold author to pick one. One of them is wrong about tree-shaking for an application package.

## Done when

The tooling rule states which packages declare sideEffects and which must not, with the reason, and agrees with the client test. A test or manifest check fails a library package that omits the field.

## Evidence

Filled at landing: what ran and where its output is.
