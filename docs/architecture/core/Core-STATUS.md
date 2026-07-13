---
kind: reference
status: active
updated: 2026-07-09
---

# Orbweaver — build status & handoff

> **Session handoff snapshot.** Orbweaver is the ground-up remake of **neo-tavern** (live code:
> `/home/inktomi/inktomi-stack/development/neo-tavern`; orbweaver:
> `/home/inktomi/inktomi-stack/development/orbweaver`). The law + doc index live in
> `AGENTS.md` §7 — read AGENTS.md first; this file is only the cursor:
> where the build is and what's next.

## Where we are (2026-07-09)

- **Phases 0–5 BUILT** (`pnpm check` + `pnpm test` green): the 6-package cake (`kit` · `contracts` ·
  `db` · `server` · `ui` · `client`), the gate suite, all server tiers, ALL domains, and the whole
  unified chat + memory + roster system — incl. the transport chat router + `streamMessages` SSE,
  memory recall wired into GATHER (`chat/substrate/assemble-gather.ts`), guided-steer routing,
  temporary-chat reap, targeted invites (`resolveHandle`), and the image-gen-in-chat caller.
- **Phase 5 FULLY CLOSED (2026-07-04):** the last seam — the OpenAI-path tool-loop (D48) — landed as
  PD-54 T1–T4 (`Core-BUILD-PLAN.md` §Phase-5 seam note). No P5 seams remain; the parity-audit log
  (`../Parity-Audit-Protocol.md`) went fully green 2026-07-09 (persona null-anchor cleared, character
  re-verified pre-lane).
- **Phase 6 (client) IN PROGRESS:** `@orb/ui` built + the primitive fleet integrated; the client
  feature-slice scaffold + gates landed and the base site boots; the feature surfaces remain and
  now build to the **D62 lane sequence** (L0 tokens → … → L7 parity; `Core-BUILD-PLAN.md` Phase 6 +
  the D62 program docs under `proposed/`).
- **Phase 7 PARTIAL:** `domain/imagery` + gallery landed early; tool-use · databank · expressions ·
  the D61 leaves (hub, roster-preset) pending.
- **D60 agent principals:** AP0–AP2 landed (identity spine + attribution + containment suite); the
  AP3+ seat wave is pending (PD-17) — though AP3's seat verb (`chat.seatAgent` + auth-matrix row) is
  already in-tree; `resolveAgentSpeaker` and the rest of the wave are not.
- Phase detail + per-phase checkpoints: `Core-BUILD-PLAN.md`. Ledger latest: **D62**
  (`Core-Laws-and-Precedents.md` + `Core-Path-Registry.md` — the UI/UX revamp program).

## NEXT ACTION

Burn down the `ready` rows in `Core-Audits-and-Debt.md` (the live registry), finish the Phase-6
client feature surfaces — current lane: `FINAL-Character-Library-and-Editor-UX.md` (repo root; its
§12 FIX #1/#2 are the pre-lane server work) — then the D60 seat wave (AP3+). (D48: DONE 2026-07-04;
PD-119 keepMounted: DONE 2026-07-09.)

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
