---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# gate-runtime-standardization names the deleted policy-family-readers rule

## What

docs/law/gate-runtime-standardization.md line 122 says policy-family-readers still requires each family's shared canonical declaration to resolve inside tooling/src/verify/lib/. That gate no longer exists after the gate moves.

## Why

Law that cites a deleted check claims an enforcement that does not run.

## Done when

The statement names the live check that enforces the family boundary, or is deleted if nothing does; check:agents passes.

## Evidence

Filled at landing: what ran and where its output is.
