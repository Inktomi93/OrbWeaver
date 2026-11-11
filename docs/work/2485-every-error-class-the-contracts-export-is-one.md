---
kind: tooling
status: doing
updated: 2026-11-11
priority: P2
area: server
lane: wt/agent-a06d7ca7c655446af
---

# Every error class the contracts export is one the transport maps to a client answer

## What

The extraction error classes in `packages/contracts/src/extraction/index.ts` extended plain `Error`, so `classifyDomainError` in `packages/server/src/transport/trpc/error-mapping.ts` did not know them and a corrupt upload answered a server error. Item 2475 fixed those two by hand. Nothing checks the rest: any exported error class in `packages/contracts/src` or a domain `contract/` directory that does not extend the domain error base reaches a route as an internal error.

## Why

A refusal that should be a client error becomes a server error with no test turning red, and the next new error class can repeat it.

## Done when

An ordinary test collects every exported error class from the contracts package and each domain contract directory, by import and not by a hand list, and fails when one is not classified to a modeled answer by the production mapper. A class that must stay an internal fault is typed or marked in its own file so the test reads the reason from production. The tree passes it, with any class it finds fixed or justified.

## Evidence

Filled at landing: what ran and where its output is.
