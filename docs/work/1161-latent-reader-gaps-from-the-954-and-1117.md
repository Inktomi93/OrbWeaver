---
kind: bug
status: open
updated: 2026-10-19
priority: P3
---

# Latent reader gaps from the 954 and 1117 verifier

## What

No live instance of any: (1) the typeof shape key misses a namespace-import root, so typeof schema.thing through import \* as schema and typeof thing give a false respell exact pair; (2) a verb-coverage wrapper with a different signature, adapt(ctx, fn), is credited to the wrapper's shared arrow instead of unjudged; (3) descent through a same-type wrapper, authorized(loadRow), credits the argument even when the wrapper holds the verb's logic.

## Why

Each lets a future spelling produce a false shape match or a false executed verdict.

## Done when

Namespace and direct typeof spellings share a key; differently-signed wrappers report unjudged; logic-bearing same-type wrappers are judged as the verb; each with a red-first case.

## Evidence

Filled at landing: what ran and where its output is.
