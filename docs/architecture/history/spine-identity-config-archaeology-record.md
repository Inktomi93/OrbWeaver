---
kind: history
status: superseded
updated: 2026-07-13
---

# Spine Identity/Config — Archaeology Record

Frozen 2026-07-13. The provenance/evolution notes stripped from the identity/config spine pair
(`core/Spine-Identity-and-Auth.md`, `core/Spine-Config-and-Serialization.md`) in the de-archaeology pass.
The live docs now carry current-state law only; this is the record of how it got there. NOT law — do not
cite from code; the current homes are the two spine docs + the D-ledger.

## Config / settings / serde

- **Four-natures rule born to untangle neo.** "Every config value has exactly one of four natures, one
  home each" exists because neo's config was a `process.env` sprawl with values wearing multiple hats.
- **`EffectiveAppConfig` grew 3 → 11 → 15.** The doc once read "stranded env-only, 3 of 7 fields," then
  11; the resolved set is 15 (`packages/contracts/src/settings/index.ts`).
- **`VLLM_*_CONCURRENCY` de-stranding.** Concurrency was once an env-only knob (`VLLM_*_CONCURRENCY`) with
  no DB home; promoted born-in-DB with a code floor and NO env var. `vllmConcurrency` is now a standard
  (b) runtime toggle.
- **`IMPORT_DEFAULT_SOURCE` dropped (PD-15, cleared), never promoted.** No chat-level default source — ST
  messages carry per-message provenance and chat-import maps each to its `message_variant` (D26); new
  turns resolve the live connection.
- **Serde consolidation (PD-33/PD-44, cleared).** The card content-hash was unified into the one kit home
  `kit/serde/card` (PD-33); the OUT-emitter `buildCardV3` moved beside the IN-adapter `cardFromJson` so
  IN/OUT/hash co-locate as one serde core (PD-44).
- **ST numeric role bimap.** `{0:system,1:user,2:assistant}` was written 4× across neo; consolidated to
  the one home `@orb/kit/message-role` (D32).
- **Raw-blob card passthrough removed.** `creator`/`cardVersion`/`regexScripts` became typed flat columns
  (D28); the old raw-blob survival path is gone (`extensions` now holds only genuine vendor residue).
- **Client-only ST preset mapper eliminated.** ST semantics are fully modeled in `@orb/contracts/preset`;
  the flat client-side mapper was removed. Full record: `preset-form-mapper-elimination.md`.

## Identity / auth

- **4-kind roster CHECK replaced the 2-way actor XOR.** `chat_participants_kind_shape`
  (`human|character|agent|observer`) superseded neo's boolean human/character actor XOR.
- **The doc was refreshed pre-build → built-state (2026-07-03).** It once carried present-tense planning
  language — "resolved twice per request," the old `viaFallback`/`viaCookie` resolver names, "role gates
  NOTHING" — all built and reworded to built-state.
- **Agent-principal landing sequence** (AP0 schema → AP1 spine mint/ceiling → AP2 attribution → AP3 seat
  wave) is tracked live in the PD-17 registry row + ledger D60 — not duplicated here.
