---
kind: adr
status: active
updated: 2026-09-23
---

# Multi-human persona resolution: the room-plane read, membership-gated

## Context

Not recorded in the ledger row.

## Decision

A persona is a single-owned library entity (`personas.ownerId`, D23). **PLAYING it in a room — holding it as your `chat_participants.activePersonaId`, or having it host-pinned as `chats.anchorPersonaId` — is CONSENT to the room consuming its PRESENTATION SURFACE: name, description, and placement preference, into the shared assembly and every member's display.** This is not new law; it states the already-shipped posture (the member-gated macro-name producer — "a co-participant's persona name is not a secret", `Chat-Macro-Resolution.md` §1 — and the persona-book world-info case, which already feeds a member persona's attached lore into the shared prompt). **The gate is the persona OWNER's PRESENT membership (`leftSeq IS NULL`) in the room — never the reader's identity (the prompt is the room's, D106), and never a copy (personas are owner-sacred; HEAL's heal-the-pointer precedent).** What is NOT consented: the persona ROW (avatarAssetId, metadata beyond placement, edit/duplicate/export stay owner-only — `PersonaService` is untouched).

- **The resolver is the widening point; the verbs' permission surface stays.** `setChatAnchorPersona` (host-only, any present human's persona) and `setActivePersona` (host-or-self, owned-by-target) are unchanged; the FOREIGN resolver honors everything they permit via the persona-domain principal-less op `resolvePersonasForParticipants` (`domain/persona/verbs/resolve-personas-for-participants.ts`), gated on the chat-supplied consent set (`chat/substrate/participants-humans.ts::presentHumanUserIdsOf` — ONE home shared by the verb and the resolver so permission and reach cannot diverge). Member persona DESCRIPTIONS enter the shared prompt unconditionally — no toggle.
- **Anchor binding on no-trigger turns:** `triggerPersonaId` is a three-state contract — an id ⇒ the triggering human; an explicit `null` (deferred drain / auto turn) ⇒ the chat ANCHOR (D51 rider); absent ⇒ the fallback chain. Unit home: `entry/compose/chat.ts::activePersonaIdFor`. Previews OMIT the trigger key when the host has no persona — explicit null is a turn semantic a preview must not inherit.
- **D62 rider (first-run):** the first-run persona ask ships as the D70-sanctioned forced `FirstRunPersonaDialog` on `app-root.tsx`, not the landing hero. Its trigger stays D107's zero-personas rule; the default-persona seeder's auto-create case is conditional on `E2E_HARNESS=on || DEV_SEED=on` (DEV_SEED pinned `on` in `tooling/src/stack/lib/stack-plan.ts`; host export wins) so the ask can never fire on a dev regen or a harness boot. The latch (`onboarding.defaultPersonaSeeded`) keeps its exact role.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
