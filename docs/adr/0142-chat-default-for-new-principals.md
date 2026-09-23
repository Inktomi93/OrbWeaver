---
kind: adr
status: superseded
updated: 2026-09-23
---

# The chat default for new principals

## Context

Not recorded in the ledger row.

## Decision

(Superseded) — **the BORN chat default was `vllm` × `chat-completions` for EVERY principal; the owner-conditional agent-sdk default is DEAD.** Owner-ruled, verbatim: *"id like to move vllm chat complete to be the default not the agent sdk sub."* **Superseded (owner word; `../design/orbweaver-inference-package.md` F2): there is no born chat default at all.** The ruling's own premise — an owner engine every principal could be born onto — went with the fleet (F1), so the selector cascade's final fallback is deleted along with the selector module that carried it: resolution now ends at the principal's OWN connection bindings, and an unbound task resolves `no-connection` with the picker as the only way a model gets set (`packages/inference/src/resolve/precedence.ts`, §7.2 of the program doc). What survives from this entry is its negative half — the owner-conditional agent-sdk default stays dead, and no path consults `isOwner` to pick a model. Consequences: an EXPLICIT `max-pro-sub` pick still derives `agent-sdk` (the pick, not the default, carries the sub); the D135(B) two-surface drift class is structurally dead for the default — neither `resolveChatCapability` nor the turn path consults `isOwner` any more; a fresh db (routine while the migration regime stays pre-launch reset-on-squash) boots already pointed at local vLLM — the owner's standing live-model posture made law. Landed at `28731d4f4`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
