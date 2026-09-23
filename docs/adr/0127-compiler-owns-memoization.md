---
kind: adr
status: active
updated: 2026-09-23
---

# The compiler owns memoization

## Context

Not recorded in the ledger row.

## Decision

*The compiler owns memoization; the CT lane runs uncompiled.* **(a)** Manual `useMemo`/`useCallback`/`React.memo` are BANNED from the react import (gate `no-manual-memo`); exemptions are TYPED ROWS with end conditions — the two compiler-denylist seals (`message-list`, `media-grid`; the gate's tripwire reds when `@tanstack/react-virtual` is delisted from the compiler denylist) and fuzzy-search's value-keyed deps. Manual memo is not merely redundant here — it demonstrably CONCEALED breakage: the memoban burn-down exposed latent CT failures manual memo had been suppressing at the reporting layer. **(b)** The CT lane runs NO compiler pass BY RULING: correctness must hold without the compiler, so a CT red the compiler would mask is a REAL DEFECT (founding case: the autosave `takeDiscard` save-loop, caught precisely because CT is uncompiled). **DECLARED LIMIT:** compiler-only defects (bail-out behavior shifts, altered effect timing) are caught only by e2e/dev-stack; the remedy if that class ever bites is a targeted COMPILED-CT project ALONGSIDE the uncompiled lane, never a swap. Minted from the memoban session's draft on the owner's word.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
