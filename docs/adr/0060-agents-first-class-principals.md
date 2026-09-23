---
kind: adr
status: active
updated: 2026-09-23
---

# Agents are first-class principals

## Context

Not recorded in the ledger row.

## Decision

Agents are FIRST-CLASS PRINCIPALS. **⚠ BUILD-STATE RIDER (truth-repaired with D121): this entry is the DESIGN of record, NOT the tree.** The AP0–AP2 machinery it describes was PURGED with the retro burn-down and the built-tense claims survived the purge: there is no `canAgent`, no `agent_principals` table, no `provisionAgentPrincipal`, no `chat.seatAgent`/`unseatAgent`, no `AGENT_SPEAKER_SOURCES`, and no containment suite; `PARTICIPANT_KINDS` is `human|character` and `chat_participants_kind_check` makes the `agent`/`observer` shape-CHECK branches unreachable by construction. What survives is DORMANT DDL kept so the rebuild needs no second migration (`db/schema/users.ts` `users_agent_shape`, `db/schema/chat.ts` `chat_participants_kind_shape`) plus the seam comments that name it. **`Spine-Identity-and-Auth.md` §4 states what is on the tree; read it first, then this entry as the design to rebuild toward** (the seat wave: buddy adoption + the rpg GM seat). Everything below describes that design. An agent = its own `users` row (`kind:'agent'` — a `USER_KINDS` tuple, never a boolean; `ownerUserId` self-FK CASCADE — owner hard-delete cascades the agent, referential physics, no reaper; a `users_agent_shape` CHECK makes loginless/`role='user'`/owned structural) + a thin `agent_principals` satellite, minted lazily at first seat-join by `sessions.provisionAgentPrincipal` (idempotent; the `__agent__` handle namespace is refused at every auth surface). Roster gains `kind:'agent'` (userId-backed AND AI-driven; per-kind shape CHECK; `AI_DRIVEN_KINDS`/`USER_BACKED_KINDS` keep dispatch exhaustive). Agent room speech is real canon, SELF-attributed (`authorUserId` = the agent, `characterId` null); funding stays the host's `runAsUserId`, responsibility stays a human `triggeredBy` — only AUTHORSHIP moves; stats attribute agent rows to the host. **The capability ceiling = two walls:** (1) agents are structurally sessionless + Principal-less — `Principal` has NO kind field and every construction site refuses agent rows (unconstructability beats runtime denies); (2) the one runtime gate is `canAgent(actor, action, room)` over the CLOSED `AGENT_ACTIONS = ["speak","tool-propose"]` union — an unlisted action is unspellable. Kill switch = `users.enabled` (one-row total containment); propose/confirm requires a human Principal; chat's engine authors agent speech via the `AGENT_SPEAKER_SOURCES` registry (chat stays source-blind). Seating: ONE chokepoint `chat.seatAgent` (host-gated; the agent's owner must be a present member); agents are never invitable, always kickable. Crew is NEVER a principal — any crew-like capability that AUTHORS canon must come through an agent seat, never runAs-host authorship. Admin surfaces show agents (kind axis) but `setRole`/`resetPassword`/`createUser` refuse them; notifications refuse agent recipients (v1); export emits provenance, never the soul; import degrades agent authors to null-author rows. Credential inheritance = owner-delegated resolve via `ownerUserId`, out-of-room paths only. The borrowed-owner posture remains the shipping posture until the seat wave (AP3 buddy + AP4a rpg GM seat, one wave; the containment suite re-runs against the live seated topology at its close).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
