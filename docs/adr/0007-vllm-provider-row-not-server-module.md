---
kind: adr
status: active
updated: 2026-09-23
---

# vLLM is a provider row, not a server module

## Context

Not recorded in the ledger row.

## Decision

vLLM is a PROVIDER ROW, not a server module. **Amended by owner word.** A vLLM box is the built-in `vllm` provider row on the `openai-compat` wire (`packages/contracts/src/inference/builtin-providers.ts`) and a user's engine is a CONNECTION to it; the only runtime slice the server keeps is the reachability + wake-on-next-turn probe at `packages/inference/src/backends/openai-compat/reachability.ts`, which is keyed on the row's folded `features.sleep` and never on a provider id. The owner's dev fleet — argv builder, spawner, reaper, gpu, wake budget, fleet control — lives outside this repo in the owner's infra (docs/plans/fleet-out/design.md). The original nested `engine/` + `surfaces/` module under the providers tier no longer exists; no vLLM-named code survives in the server.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
