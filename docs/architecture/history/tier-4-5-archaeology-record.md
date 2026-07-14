---
kind: history
status: active
updated: 2026-07-13
---

# Tier-4-Transport / Tier-5-Entry — archaeology record

Frozen 2026-07-13, extracted from `core/Tier-4-Transport.md` + `core/Tier-5-Entry.md` when those two law
docs were tightened to state current law only. Nothing here is live law — the current rule lives in the
core doc; this is the dated-incident + provenance journey that git history would otherwise carry. Do not
cite from code or from a core doc.

## The rate-limit clock-seam origin (Tier-4 Esoteric #1)

The limiter's injectable `now()` seam exists because of the **2026-06-11 auth-routes flake**: rapid login
attempts straddling a fixed-window boundary split across two buckets, so the N+1th never tripped the cap.
The standing rule (the seam is the limiter's only impurity; tests pin time through it) lives in the core
doc; the flake is the why-it-was-added.

## The two-bucket rate split — the pre-split benchmark (Tier-4 Esoteric #7)

Before the authenticated-per-user / anonymous-per-IP split, the bench **tripped the 60/min cap on every
query** because a real session was throttled on the anonymous IP bucket. The split (generous per-user vs.
tight per-IP, with a shared sentinel bucket for an unresolvable peer) is the standing design; the 60/min
number is the measurement that motivated it.

## The DB-backed limiter replacement (Tier-4 Esoteric #2)

The DB-backed fixed-window limiter **replaced per-process in-memory limiters**, which allowed N× the
configured cap under N replicas. The standing design (bucket key `scope:id:windowStart`, the atomic
`INSERT … ON CONFLICT DO UPDATE … RETURNING count`, the lazy `LIKE 'scope:%'` PK-range sweep) is live law
in the core doc; the "what it replaced" framing is the migration record.

## The PD-106 enforcement journey (Tier-4 §"multi-human surface")

The `AUTH_MODE != 'single-user'` NOT\_FOUND capability gate was, for a stretch, **declared everywhere and
enforced nowhere** (PD-106). It was burned down 2026-07-03 (wired as `multiHumanProcedure` in
`transport/trpc/trpc.ts`), then re-axed 2026-07-10 when the flag flipped from `ctx.singleUserMode` to the
inverted `ctx.multiHumanCapable` and the invites router adopted the rung. The standing ruling (every
multi-human surface rides `multiHumanProcedure`; anonymous probes see the unmounted-procedure 404) lives
in the core doc + the cleared-ledger PD-106 row; the burn/re-ax dates are the journey.

## Tier-5 boot-order narration correction

An earlier revision of the boot-order section described the pre-compose seed step as also seeding the
credential / preset / themes / characters / persona rows and reclaiming chat locks. In the built
`entry/lifecycle.ts`, only `seedOwner` runs pre-compose (it resolves the owner id the compose graph binds
against — the boot chicken-egg); every other seed + the lock reclaim + the host-offline deferred-turn
drain run POST-compose, because they consume composed services/seeders. The core doc now states the split
verified against the code; this note records that the prior narration was corrected, not that the boot
sequence changed.
