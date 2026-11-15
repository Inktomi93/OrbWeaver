---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# A SQL predicate on a role column reads the role's meaning from the identity contracts

## What

`orb/no-role-comparison` sees JavaScript comparisons only. Drizzle predicates such as `eq(chatParticipants.role, "host")` and `eq(users.role, "owner")` spell the room host and the box owner inline in many persistence and verb files, for example `packages/server/src/domain/discovery/persistence/embed-store-reads.ts` and `packages/server/src/domain/sessions/persistence/users.ts`. Some sites already derive their list from the home (`HOST_ROLES` in `packages/server/src/domain/databank/persistence/scope.ts`).

## Why

Each inline SQL spelling is a second place that decides which role holds room authority or owns the box, and the rule stays green on it.

## Done when

Every SQL predicate on `users.role` or `chat_participants.role` takes its values from a list derived from `isHostRole` or `userRoleSatisfies`, and a type-aware rule refuses a role literal or role-typed value passed to a drizzle comparison on a role column.

## Evidence

Filled at landing: what ran and where its output is.
