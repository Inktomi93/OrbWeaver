---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Orchestration left in persistence folders becomes injected ops

## What

The substrate purity work moved some helpers that sequence several writes into `persistence/`, because no verb or subsystem home fit without a rewire. The lane report lists them. Bind each in its domain's root context and inject it as an op, as chat's turn gather is.

## Why

A persistence folder that sequences work hides orchestration from the policies that govern verbs and subsystems.

## Done when

Each listed helper is bound in its domain's root context, its persistence file holds row access only, and the persistence policy item can land without a violation.

## Evidence

Filled at landing: what ran and where its output is.
