---
kind: plan
status: parked
updated: 2026-10-02
blocked: owner
---

# Agent principals: attributed and bounded room actors

## Goal

Let an agent participate with its own attribution and an explicitly bounded authority when the owner resumes the program.

## Shape

The core concept is a room actor whose actions remain attributable and limited. D60 and D19 retain identity, capability and funding constraints; this concept authorizes no new login or execution path.

## Open questions

The owner selects seats and capabilities before a fresh design.

## Rejected

A second authentication or unrestricted tool-execution path is not part of this concept.

## Coupled sites

`packages/db/src/schema/users.ts`, `packages/server/src/domain/sessions/` and `docs/law/Spine-Identity-and-Auth.md`.

## Test plan

A resumed design must prove attribution, containment, funding and session exclusion.
