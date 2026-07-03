---
kind: reference
status: active
updated: 2026-07-03
---

# Orbweaver — build status & handoff

> **Session handoff snapshot.** Orbweaver is the ground-up remake of **neo-tavern** (live code:
> `/home/inktomi/inktomi-stack/development/neo-tavern`; orbweaver:
> `/home/inktomi/inktomi-stack/development/orbweaver`). The law + doc index live in
> `AGENTS-1-Architecture.md` §5 — read the AGENTS-1/2/3 set first; this file is only the cursor:
> where the build is and what's next.

## Where we are (2026-07-03)

- **Phases 0–5 BUILT** (`pnpm check` + `pnpm test` green): the 6-package cake (`kit` · `contracts` ·
  `db` · `server` · `ui` · `client`), the gate suite, all server tiers, ALL domains, and the whole
  unified chat + memory + roster system — incl. the transport chat router + `streamMessages` SSE,
  memory recall wired into GATHER (`chat/substrate/assemble-gather.ts`), guided-steer routing,
  temporary-chat reap, targeted invites (`resolveHandle`), and the image-gen-in-chat caller.
- **One Phase-5 seam open:** the OpenAI-path tool-loop (D48) — `domain/chat/engine/pipeline.ts` marks
  it the next chunk.
- **Phase 6 (client) IN PROGRESS:** `@orb/ui` built + the primitive fleet integrated; the client
  feature-slice scaffold + gates landed and the base site boots; the feature surfaces remain.
- **Phase 7 PARTIAL:** `domain/imagery` + gallery landed early; tool-use · databank · expressions ·
  the D61 leaves (hub, roster-preset) pending.
- **D60 agent principals:** AP0–AP2 landed (identity spine + attribution + containment suite); the
  AP3+ seat wave is pending (PD-17).
- Phase detail + per-phase checkpoints: `Core-BUILD-PLAN.md`. Ledger latest: **D61**
  (`Core-Laws-and-Precedents.md` + `Core-Path-Registry-D60-D61.md`).

## NEXT ACTION

Burn down the `ready` rows in `Core-Audits-and-Debt.md` (the live registry — \~18 open), finish the
Phase-6 client feature surfaces, land the D48 tool-loop chunk, then the D60 seat wave (AP3+).

## Recon method that worked (keep for verification passes)

General-purpose agents reading whole files top-to-bottom (not grep-skim), structured `file:line`
returns, then verify/synthesize — verifying doc claims against real code repeatedly caught drift.
NOTE: *background* general-purpose agent launches were flaky in this environment (some returned 0
tool-uses); foreground launches were reliable.

## Reference material

- `references/sillytavern` (ST source — read, don't copy); `references/marinara-engine`,
  `references/stmp`.
- The original memory intent: `~/Downloads/memory-diagram.pdf` (the summarizer+vector replacement).
- neo-tavern's `docs/architecture/*` (layer cake, chat-resolution-pipeline, send-round-trip,
  feature-organization) and its `docs/plans/unified-group-chat.md` (§11.5 group-as-character memory is
  load-bearing). The steady clone for the parity oracle: `/tmp/neo-tavern-steady`.
