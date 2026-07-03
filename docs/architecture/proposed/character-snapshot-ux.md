---
kind: spec
status: draft
updated: 2026-07-03
---

# character — snapshot history UX (deferred, not blocking)

`CharacterService.snapshot`/`listSnapshots`/`restore` are built and contract-stable
(`packages/server/src/domain/character/verbs/{snapshot,list-snapshots,restore}.ts`) — the git-commit-style
history log works regardless of any UI. What's still open is presentation only:

- Does an explicit `snapshot` call carry a user-visible label in the client, or is it label-optional/silent?
- Does the client surface a version-history panel (browse `listSnapshots`, trigger `restore`), or does
  `snapshot`/`restore` stay a backend-only capability until a client need materializes?

**Criterion:** decide at build time when the character-editor UI is built. No backend change implied either
way — `label` is already optional on `SnapshotParams` (`contract/params.ts`).
