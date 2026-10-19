---
kind: tooling
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a8eefd5226fb420e7
---

# Server factory tier reference refusals cover the server program

## What

orb/server-factory-tier-reference reports about thirteen hundred fail-closed refusals over packages/server: an authored reflected, conditional, mapped or indexed bound; an indirect generic actual that reaches an unknown declaration, including TypeScript lib generics such as lib.es2019.array.d.ts; a native public reference such as globalThis that resolves under node_modules; and an authored public boundary missing an explicit type. The native rule therefore cannot decide placement on most of the server, and native lint over the server is red. reports/review/981-type-home-slice.md records the refusals; item 1077 covers only the real placement findings.

## Why

A refusal is correct under D328 but leaves the server type-home claim unproven and the lint stage red, so a real cross-tier exposure is hidden in the refusal volume.

## Done when

Each refusal class is either decided by the rule (lib and node_modules declarations judged as foreign, reflected and mapped bounds resolved through the checker) or fixed at the site with an explicit type; native lint over packages/server reports no refusal; a planted cross-tier exposure in each class is still flagged.

## Evidence

Owner direction: first audit whether the rule should exist in this form. Ask whether package and tier boundaries plus a tightened type, a lint selector or a test can hold the claim; a custom type-aware analysis survives only if none can. Then apply D328 to what survives: an unknown outside the rule's stated claim is advisory, not blocking.
