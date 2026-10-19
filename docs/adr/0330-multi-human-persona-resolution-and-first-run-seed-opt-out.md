---
kind: adr
status: active
updated: 2026-10-19
---

# Multi-human persona resolution is membership-gated, and the first-run persona ask can be opted into on an automation stack

## Context

A persona is owned by one user but played in shared rooms. The first-run ask must appear on a real first sign-in and must not block an automation stack. An e2e spec for the ask needs an account the auto-seed leaves alone.

## Decision

A persona is a single-owned library entity (`personas.ownerId`, D23). **PLAYING it in a room — holding it as your `chat_participants.activePersonaId`, or having it host-pinned as `chats.anchorPersonaId` — is CONSENT to the room consuming its PRESENTATION SURFACE: name, description, and placement preference, into the shared assembly and every member's display.** This states the posture the producers already follow (the member-gated macro-name producer — "a co-participant's persona name is not a secret", `Chat-Macro-Resolution.md` §1 — and the persona-book world-info case, which feeds a member persona's attached lore into the shared prompt). **The gate is the persona OWNER's PRESENT membership (`leftSeq IS NULL`) in the room — never the reader's identity (the prompt is the room's, D106), and never a copy (personas are owner-sacred).** What is NOT consented: the persona ROW (avatarAssetId, metadata beyond placement, edit/duplicate/export stay owner-only — `PersonaService` is untouched).

- **The resolver is the widening point; the verbs' permission surface stays.** `setChatAnchorPersona` (host-only, any present human's persona) and `setActivePersona` (host-or-self, owned-by-target) are unchanged; the FOREIGN resolver honors everything they permit via the persona-domain principal-less op `resolvePersonasForParticipants` (`domain/persona/verbs/resolve-personas-for-participants.ts`), gated on the chat-supplied consent set (`chat/substrate/participants-humans.ts::presentHumanUserIdsOf` — ONE home shared by the verb and the resolver so permission and reach cannot diverge). Member persona DESCRIPTIONS enter the shared prompt unconditionally — no toggle.
- **Anchor binding on no-trigger turns:** `triggerPersonaId` is a three-state contract — an id ⇒ the triggering human; an explicit `null` (deferred drain / auto turn) ⇒ the chat ANCHOR (D51 rider); absent ⇒ the fallback chain. Unit home: `entry/compose/chat.ts::activePersonaIdFor`. Previews OMIT the trigger key when the host has no persona — explicit null is a turn semantic a preview must not inherit.
- **First-run ask (D62 rider):** the first-run persona ask ships as the D70-sanctioned forced `FirstRunPersonaDialog` on `app-root.tsx`, not the landing hero. Its trigger stays D107's zero-personas rule. The default-persona seeder auto-creates a persona only on an automation stack (`E2E_HARNESS=on || DEV_SEED=on`; DEV_SEED is pinned `on` in `tooling/src/stack/lib/stack-plan.ts`, and a host export wins), so the ask cannot fire on a dev regen or an unlisted harness account. The latch (`onboarding.defaultPersonaSeeded`) keeps its exact role.
- **Accounts that meet the ask on an automation stack:** `E2E_FIRST_RUN_ASK_HANDLES`, a comma list of handles compared on the D257 key, removes those accounts from the auto-create. The list only subtracts: it has no effect on a stack with neither `E2E_HARNESS` nor `DEV_SEED` on, and no value of it turns the auto-seed on. The policy is `personaAutoSeedAdmits` in `packages/server/src/foundation/env/index.ts`, which the seeder calls with the principal. The e2e mode configuration (`tests/e2e/support/modes.ts`) names the accounts once and sends them to the local project's server; every other account keeps the seeded persona.

## Consequences

The first-run ask is testable in e2e without a second harness. The opt-out is data in the e2e mode configuration and cannot enable a seed.

## Alternatives rejected

A separate e2e project with the auto-seed off: a second stack for one case. A server endpoint that toggles the seed: a test-only door in production code.
