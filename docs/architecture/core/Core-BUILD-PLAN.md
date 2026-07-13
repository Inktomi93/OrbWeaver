---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — build plan (the ordered runbook)

> **Status: build is at Phase 6+; completed-phase step detail is archaeology.** This file is a slim
> cursor — the phase state, one line each. The full executed per-phase runbook (step-level detail,
> landing commits, checkpoints) is frozen at `../history/build-plan-record.md`. If anything here
> disagrees with the ledger (`Core-Laws-and-Precedents.md`), the ledger wins.
>
> **Stack note:** version pins live in the pnpm catalog; per-tier runtime libs joined it as their tier
> was built.

## Phase state

| Phase | State |
| - | - |
| 0 — workspace + gates | BUILT |
| 1 — `@orb/kit` | BUILT |
| 2 — `@orb/contracts` | BUILT |
| 3 — `@orb/db` | BUILT |
| 4 — `@orb/server` | BUILT |
| 5 — chat + memory + roster (D16, differential-oracle gated) | BUILT |
| 6 — `@orb/client` + `@orb/ui` | L0–L6 landed (shell/polish revamp, desktop + mobile); remaining UI work owned by `../proposed/ui-cohesion-north-star.md` §6 |
| 7 — committed feature domains | Built: `domain/imagery`, gallery v1/v2, tool-use (D48/PD-54), `domain/hub`, direct model providers. Remaining: databank, expressions, `domain/roster-preset`, and the staged design sets → `../proposed/README.md` |
| 8 — scripting / automation / plugin system (D46) | Not started |

Phases 6–8 depend only on Phase 5 — parallel post-chat tracks; the numbering is suggested priority, not
a hard chain.

## Cross-cutting (every phase)

- **Tests travel with code** — each new file's test lands at its mirror path or `check` goes red (`test-layout` + `test-presence`).
- **Owned risks, no action** (`Core-Planning-and-Checklists.md §E`): the Qwen3-VL single-model concentration (cosine≈1.0 probe guards it); single-replica is the v1 stance (every `ASSUMES(single-replica)` site has a named DB-backed replacement seam).
- **The verification method that works** (keep using it): general-purpose agents reading whole files + a grep sweep for losing-side strings after any structural change.
