---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# The key-check path invariant is carried in its type

## What

A provider row's key-check path is validated by its schema, and a runtime guard refuses a path that leaves the row's origin. The guard is unreachable while every source parses the schema, so its test builds a state the product cannot produce.

## Why

An impossible case is closed with a type here, not with a runtime check a test has to fake its way to.

## Done when

The path is a branded type minted by the schema, so a resolved feature set cannot hold an unparsed path and the faked state is a type error; or the owner accepts the shape in a recorded ruling.

## Evidence

Filled at landing: what ran and where its output is.
