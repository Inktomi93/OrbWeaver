---
kind: adr
status: active
updated: 2026-10-17
---

# Schema-only exports do not require output aliases

## Context

Requiring an output identity for every exported schema creates unused types and an expensive export census. Schema-only constraints can have valid consumers.

## Decision

Allow exported Zod schemas without companion output types. Keep canonical schema and data type homes. Derive output types when consumers need them. Preserve mutual output assignability for independently authored promises, including contextual and aliased contracts. Retain issues-origin enforcement and shared readers needed by remaining consumers. This resolves the schema-membership hygiene decision under D321.

## Consequences

Retire the exported-schema membership policy and its permissions. Preserve schemas, factories, parsing, defaults, transforms, wire behavior and real parity controls. Native parity migration requires a separately qualified construction boundary.

## Alternatives rejected

Create unused inferred aliases or nominal brands to satisfy a census. Replace semantic output checks with member-name selectors or one-way assignments.
