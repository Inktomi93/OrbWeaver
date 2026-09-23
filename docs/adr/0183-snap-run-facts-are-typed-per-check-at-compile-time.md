---
kind: adr
status: active
updated: 2026-09-23
---

# Snap run facts are typed per check at compile time

## Context

The Snap run index stores machine-readable facts from each check. Wrong data filed under a check's name, or a page fact filed as a context fact, must not reach a reader.

## Decision

`tooling/src/snap/contract/run-facts.ts` holds `ARM_FACT_DATA_SCHEMAS`, a Zod record that `satisfies Record<Arm, z.ZodType>`. Each fact is a discriminated object whose `arm`, `schema` and `data` come from that record. `ArmFactDataByArm` is a mapped type over `Arm`. A mismatched check, schema id or data shape is a `tsc` error. Page and context indexes are distinct branded types. `tests/tooling/snap/contract/run-facts.test-d.ts` pins both rules. Zod is the one trust-boundary grammar, and every public fact type is inferred from it.

## Consequences

A new `Arm` member fails compilation until it declares its data schema and schema id. Readers trust the type, not a schema string.

## Alternatives rejected

A generic schema-labelled `Record<string, JsonValue>` fact (owner ruling): it cannot make wrong data or a page and context swap fail compilation, and it moves trust into prose and schema strings.
