---
kind: adr
status: active
updated: 2026-09-23
---

# Standing meta-rules from the neo client audit

## Context

Not recorded in the ledger row.

## Decision

The neo-client audit's standing meta-rules (full law: `UI-Gates-and-Lessons.md` §11): (1) **no directory is exempt from a boundary rule** — exemption zones become rot zones; no `_shared` drawer exists; `@orb/ui` sits under the same token gates. (2) **Every footgun is carried by STRUCTURE, never a remembered convention** — `createSavedEntityForm`/`createAutosaveEntityForm` own the form footguns (autosave's type has `reset` removed). (3) **The tRPC router + `@orb/contracts` ARE the cross-feature contract** — legit cross-feature reads call the public front door. Sealed primitives: `virtual-list`/`message-list` (TanStack Virtual with `directDomUpdates`+`containerRef` per D54), `charts` = ECharts (per D52), `sortable` (@dnd-kit), the `ChatHandle` discriminated `committed|draft` type, the central `invalidation.ts` seam (one event→queryFilter map). Streaming: Streamdown owns parse/repair/security (two-policy seam: `trusted` AI output vs `untrusted` cards/other-users); `useSmoothText` stays the pacer (sealed, grapheme-safe); version floor ≥2.5 + error-boundaried lazy chunks + the golden streaming code-fence test. Born-compliant sequencing: primitives + codegen + gates ship BEFORE any feature agent runs. queryKeys are 100% tRPC-codegen (`no-array-literal-querykey`); `persist-shape-needs-version`; typed-`testId`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
