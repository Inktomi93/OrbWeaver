---
kind: adr
status: active
updated: 2026-09-23
---

# The UI package is the domain-agnostic component layer

## Context

Not recorded in the ledger row.

## Decision

The client foundation (full law: the `UI-*.md` docs): `@orb/ui` is the domain-agnostic component package — the frontend cake is `kit ← contracts ← ui ← client`, and neo's UI lint rules become resolver PHYSICS (third-party UI libs live only in ui's package.json; ui cannot know a domain type; every kept lib is wrapped/sealed). Base UI (`@base-ui/react`), NOT Radix/shadcn. Tokens: DTCG single-source → generated Tailwind v4 `@theme` + typed map — theme is derived, never hand-authored. Container-driven responsiveness (shell is the only viewport-`@media` site; features write `@container` only). State: TanStack Query (server) + gated Zustand (client); TanStack Form above the threshold, RHF banned. Markdown = Streamdown sealed in `@orb/ui/markdown` (one renderer for chat + static). React 19: Compiler-ON, `<Activity>`, `useEffectEvent`, View Transitions, ref-as-prop; React form Actions/useOptimistic SKIPPED (TanStack owns forms/optimistic). Deferred-with-default: Panda `strictTokens` only if raw-value lint-bypass is observed. Baseline WCAG 2.2 AA + reduced-motion.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
