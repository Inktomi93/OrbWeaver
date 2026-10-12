---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
plan: test-mirror
---

# The antipatterns verb reads the structure report through its one home

## What

tooling/src/ast/ops/antipatterns.ts re-declares part of verify's StructureReport shape to read check-structure.json, because the sibling-tool import ban and the verify/index to debt to ast/index import cycle block importing it. Give the artifact shape a floor-level home that both verify and ast import, and delete the copy.

## Why

A second copy of a shape is a defect here; the verb's view drifts silently when the report changes.

## Done when

One declaration of the structure report shape, imported by verify and the antipatterns verb, with no import cycle and no exemption.

## Evidence

Filled at landing: what ran and where its output is.
