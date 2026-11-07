---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: testing
lane: wt/agent-af0eb63da78e0d44e
plan: test-foundation
---

# Require a current-turn assistant reply in character chat journeys

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-E2EFOUND-Q001`: Require a reply associated with the current turn in the character-chat journeys. Preserve user-commit and control-recovery assertions under D166.

Inspect `tests/e2e/start-chat-with-character.spec.ts`, `packages/client/src/features/character/surfaces/character-library-surface.tsx`, `packages/client/src/state/active-chat-store.ts`, `packages/client/src/data/use-start-chat.ts`.

## Why

`AF3-E2EFOUND-Q001`: Resuming a room can expose an earlier assistant message that satisfies the reply assertion while the current generation fails or remains held.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-E2EFOUND-Q001`: Retained history cannot satisfy a held or refused current reply. A successful new reply does. Preserve current creation and subsequent-send behavior.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
