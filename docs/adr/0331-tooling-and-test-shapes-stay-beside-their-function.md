---
kind: adr
status: active
updated: 2026-10-20
---

# Tooling and test shapes stay beside the function that uses them

## Context

D324 owns server factory shapes in entry, transport, infra and foundation by their production signature. Tooling sends result shapes and config schemas to the tool contract/ (Core-Tooling-Law section 2.5) and says nothing of helper options. Maintained tests keep shared shapes in the test kit and fixture modules. Only exported tooling and test aliases were judged, so a helper's option type could stay only by being an interface, or move by renaming its file.

## Decision

In tooling/src and in maintained tests, an exported alias or interface is at home in the file that declares a function whose signature uses it: a parameter, the return type, or a declaration reached from them. A plain-data shape with a wire-vocabulary name stays wire data and takes a home. A zod shape schema is never signature-owned. The other homes stay: the tool contract/ folders and floor/, the test kit under tests/support, fixture and support modules, and every contract/ folder. ESLint orb/type-home-direct-export judges both populations with the D324 signature reader. Spine-TypeScript section 7.4 holds the rows. Legacy tests stay outside type-aware lint (D320).

## Consequences

A helper keeps its options and results. A shape that no local signature uses moves to a home. Typed placement lint runs over the tooling and maintained-test programs. The custom no-inline-types gate no longer judges tooling or tests.

## Alternatives rejected

A tooling ownership rule per slot (lib, ops): it restates the signature reader by folder. Name-spelled test homes alone: they split a helper's option types from its function.
