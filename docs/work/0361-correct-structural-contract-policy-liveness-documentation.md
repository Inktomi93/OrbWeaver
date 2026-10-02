---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: tooling
---

# Correct structural contract-policy liveness documentation

## What

State the current proof purpose of AUTOMATION_BUS_EVENT_TYPES, CONTENT_CLASS_POLICY and KIND_DEFS. Keep their exhaustive membership and meaningful behavioral or type checks.

## Why

The bus facts discover the automation registry structurally, but its annotation cites a future client invalidation consumer. The content policy and capability definitions support current checks, while comments imply runtime lookups that their callers do not perform.

## Done when

Confirm the bus fact readers, content projection binding tests and capability type checks. Correct annotations and nearby claims without inventing runtime consumers or weakening existing checks. Preserve the current policy values and their canonical homes. Use the supported public-marker contract.

## Evidence

Filled at landing: what ran and where its output is.
