---
paths:
  - "packages/server/src/domain/rpg/**"
  - "packages/client/src/features/rpg/**"
---

# rpg domain

- A rpg turn is a tool-less character turn plus a post-commit state round. The round reuses the
  turn's resolved connection and consent. Never re-resolve them.
- An empty assistant message slot in a game chat is a canon-state anchor for a snapshot write.
  Never delete it as a lost completion.
- Add a new `config.features` field to the `mergeFeatures` keep-on-omit spread. Otherwise the next
  unrelated config write resets it to default.
- Seed and write the protagonist sheet, inventory, and wallet planes to the human user's
  `actorRef`, not the roster character's `actorRef`.
- A new model-writable rpg field touches `packages/contracts/**`, the domain apply verb, the
  tracker-view, compose ref-resolution, and the client panel. Prove a field is model-unwritable by
  its absence from the extraction schema string.
- An op-shaped write against rpg hand state derives its next state inside the same head resolve in
  `snapshot-edit.ts` (`writeHandState`). Never build a patch or image outside that resolve.
- RPG lock suppression fires at both the staging accumulator and the flush fold in
  `substrate/merge.ts`. Test any lock-behavior change at both sites, not only the fold.
- In `packages/client/src/features/rpg/**`, when the client re-derives a dotted lock or state path
  the server also mints, treat both as one coupled value. Assert the rendered chip in a test, not
  only the store.

Game words (`party`, `npcs`, `quest`, `encounter`) stay inside this domain. An rpg surface names a
chat concept with the chat word: look up which word names which concept in
`docs/design/vocabulary-map.md`.
