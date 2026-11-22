---
kind: work
status: open
updated: 2026-11-22
priority: P2
area: client
plan: unwired-code
---

# The client reads tRPC error reasons as the closed union the server sends

## What

trpcErrorReason in packages/client/src/lib/trpc-error-reason.ts returns a plain string, so a comparison against a reason the server never sends compiles and a switch over reasons is never checked for exhaustiveness. Type its return as the closed union of reasons the server's refusal codes declare in packages/contracts.

## Why

The owner chose to let the compiler check client error handling instead of having the unwired codes scan count string comparisons as handlers; a misspelled or dropped reason then fails tsc.

## Done when

trpcErrorReason returns the contracts reason union, every client comparison and switch over it typechecks against that union, a removed server reason fails pnpm typecheck in a planted case, and pnpm unwired codes credits these handlers through the typed path.

## Evidence

Filled at landing: what ran and where its output is.
