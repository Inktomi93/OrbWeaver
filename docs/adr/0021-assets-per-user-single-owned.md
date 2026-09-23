---
kind: adr
status: active
updated: 2026-09-23
---

# Assets are per-user single-owned

## Context

Not recorded in the ledger row.

## Decision

Assets/PNGs/images are PER-USER single-owned; nothing is global. `assets.ownerId`, `unique(ownerId, hash)`, per-user-keyed CAS (`<owner>/<ab>/<cd>/<hash>` — no cross-user dedup or existence oracle). `/blob/:hash` is OWNER-GATED: the proxy may skip forward-auth for image GETs, but the APP is the gate (same-origin session cookie → `fetchOwned` → serve or 404); `Cache-Control: private, immutable`. A cross-origin future uses short-lived signed URLs. ONE membership exception: a roster participant may fetch a shared-chat character's avatar + expression-sprite set (the in-room public face) — never the card, never arbitrary blobs.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
