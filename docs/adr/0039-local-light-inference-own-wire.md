---
kind: adr
status: active
updated: 2026-09-23
---

# Local light inference is its own wire

## Context

Not recorded in the ledger row.

## Decision

`local-light` (in-process transformers.js/ONNX) is its own wire and a keyless built-in provider row. **Amended: the credential-source and backend-key axes it was originally spelled in no longer apply** — the axes are now `WIRES` + the provider registry (`packages/contracts/src/inference/wires.ts`, `packages/contracts/src/inference/builtin-providers.ts`), and the wire is sealed in `packages/inference/src/backends/local-light/`. Task policy is unchanged in substance and is now DATA, not a hand-kept mirror: `WIRE_DEFS["local-light"].serves` is `embed`/`imageEmbed`/`rerank` only, and the derived table in `packages/contracts/src/inference/policy.ts` is the one home both sides read (the mirrored firewall the original entry described is gone — D39's reason was that contracts could not import it, and the derived table removed that constraint).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
