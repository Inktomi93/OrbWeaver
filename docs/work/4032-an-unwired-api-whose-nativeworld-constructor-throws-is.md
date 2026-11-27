---
kind: bug
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a0a89273c8ff2ec22
---

# An unwired API whose NativeWorld constructor throws is closed

## What

tooling/src/unwired/native.ts constructs a NativeWorld over an open API; when the constructor throws, the API is never closed, so its compiler process outlives the run and its close sample never fires.

## Why

A leaked compiler holds memory for the rest of a long scan and hides its peak from the profile.

## Done when

A constructor throw closes the API before rethrowing, with a case that plants a throwing world and observes the close.

## Evidence

Filled at landing: what ran and where its output is.
