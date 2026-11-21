---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
---

# Curated capability rows state structured output limits and the structured plan reads them

## What

generationCapabilitySchema.output.structuredLimits (packages/contracts/src/inference/capability/generation.ts) is never written: no curated row states a provider's limits on strict tools, object properties, enum values, depth or name length, so the structured plan cannot refuse a schema past them. Owner ruling: request-shaping capability fields stay and get wired.

## Why

A schema past a provider's structured output limit fails at the provider instead of being refused or shaped first.

## Done when

Curated rows state structuredLimits for every provider whose docs publish them, cited from the provider docs; packages/inference/src/structured/plan.ts refuses or shapes a schema past them; a plan test covers each limit.

## Evidence

Filled at landing: what ran and where its output is.
