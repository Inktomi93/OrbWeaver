---
kind: adr
status: active
updated: 2026-09-23
---

# Client architecture lockdown is law

## Context

Not recorded in the ledger row.

## Decision

**Client-architecture lockdown is LAW.** The client composition doctrine lives in [`client-architecture-lockdown.md`](../architecture/core/client-architecture-lockdown.md); all decisions O1–O8 are closed. O4 buddy-bus adoption stays flagged as a tracked follow-up.

Standing rulings: composition is ONE registry primitive (`createRegistry`/`createContributorRegistry`, home `client/src/lib/registry.ts`) — no parallel static maps. A section, settings pane, modal, or contributor is ONE co-located definition on its owning feature's front door, assembled exactly once at the composition root (`main.tsx`). The `/` route is a thin mount, `app-root.tsx` (no `sections={{…}}` god-map, no feature imports in a route body). Tiers flow one direction, five tiers (`@orb/ui` → `components/` → `{data,forms,state}/` → `lib/` → `features/`; `components/` is tier 2; features import DOWN only, never each other at runtime). The paint law lives only in [`client-architecture-lockdown.md` §4](../architecture/core/client-architecture-lockdown.md#4-the-paint-law--who-may-write-css-and-why), including its six path-closed homes and bounded shell exception. The section PLANNED state (`content: {planned: reason}` — the marker and the real body are the SAME field, so a stale exemption is unrepresentable) governs every section; refinery is the founding member. STRICT-typed context tabs use the `defineContextTabs<S>` mint over each host's published projection (`ContextDefinition` itself is non-generic — §6b). The inter-feature channel matrix (§12 — trpc is cache-first, the state commons carry ephemeral cross-cutting state, the contributor registry is the foreign-extension seam) governs which channel a cross-feature need uses. The event/sync spine tiers (durable-first chat bus · live-only self-healing user bus · durable notifications inbox) unify behind `defineBusChannel` with a full producer-coverage/exhaustiveness guard on every bus. Enforcement is 14 NEW gates (G1–G12, G14, plus the G13 amendment set and G23 — §16) atop the existing G15–G22 families; every seam has a wall.

**Precedence: this D-entry (and the D-ledger) win over the doc; the order is D-ledger → the core `UI-*.md` set → this doc.** The doc is core law: its §15 reconciliations were applied as edits to the core `UI-*.md` docs, every G-gate is registered in `Core-Enforcement-Active-Gates.md`, and O2 stub-policy is closed (`feature-owns-definition` live).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
