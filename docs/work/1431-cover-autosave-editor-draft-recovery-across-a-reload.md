---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: client
plan: test-foundation
---

# Cover autosave editor draft recovery across a reload

## What

The character, preset, world-info entry and automation rule editors keep crash-survival drafts through createAutosaveEntityForm and their entity draft stores, but no test reloads the page and proves an unsaved edit is restored. Existing coverage stops at the store lifecycle and in-session retry.

## Why

Draft recovery is the feature's whole point; a regression would lose typed work silently.

## Done when

An E2E journey types into an editor, fails or interrupts the save, reloads, and sees the edit restored and then saved, with a control that fails when the draft store is not wired; chosen per Spine-Testing §10.

## Evidence

`tests/e2e/corpus-editor-draft-recovery.spec.ts` edits a character name with `character.update` refused, reloads, finds the edit restored in the editor with the server still holding the old name, then resumes saving and reads the new name on the server and `Saved`. `pnpm e2e:corpus tests/e2e/corpus-editor-draft-recovery.spec.ts --project=corpus-desktop-bubble` with `E2E_PORT_OFFSET=20`: 1 passed.

- Control: with `draft: characterDraftStore` removed from `CharacterForm`, the reloaded editor shows the server name and the case fails.
- The journey found the character editor reading `Saved` over a restored draft. `AutosaveSession.status` now carries the restored arm once, and every editor that renders `AutosaveStatus` from a session reads it. `tests/client/features/character/components/draft-status.ct.tsx` covers the shared session: red with the mapping removed, green with it.
- Only the character editor has a reload journey. The preset, world-info entry and automation rule editors share the session mapping but have no e2e.
