---
paths:
  - "packages/default-content/**"
---

# Default content package

Read the header of `packages/default-content/src/index.ts` before you change this package. The rulings below come from it and from its ledger rows.

## Placement

- The package depends on `@orb/kit` alone. The `default-content-cake` rule in `.dependency-cruiser.ts` enforces the direction.
- No `domain/**` module imports the package. The composition root in `packages/server/src/entry/compose/` closes over its readers and injects the bytes into the seeders, which stay filesystem-unaware (`docs/adr/0160-default-content-ships-as-a-workspace-package-the.md`). The `domain-no-default-content` rule in `.dependency-cruiser.ts` refuses every such import, type-only included; a shape a domain needs lives in its own `contract/`.
- Shipped bytes belong in this package, not in a server directory an image build copies. The server declares the package as a dependency (`docs/adr/0160-default-content-ships-as-a-workspace-package-the.md`).
- Character card definitions, themes and the default preset stay in their server domains. They are code with domain meaning (`docs/adr/0160-default-content-ships-as-a-workspace-package-the.md`).

## Seed content

- The seed is content, never a conversation. Ship no room or transcript (`docs/adr/0263-seed-content-and-a-first-run-persona.md`).
- `packages/default-content/src/manifest.ts` is the one manifest of seeded items. Never seed a persona for a person, who names their own in the first-run step (`docs/adr/0263-seed-content-and-a-first-run-persona.md`).
- A manifest `key` never changes once shipped. The per-account seed ledger records each key, so a rename reseeds the item (`packages/default-content/src/contract/index.ts`).
- A campaign roster sets `startsGame`. The seeder stores rpg's default game template on it (`docs/adr/0264-roster-preset-carries-a-game-template.md`).
- A scene plate is an ordinary owned background asset, not a separate background channel. Name its file `<handle>-bg` so a card and its plate stay paired (`packages/default-content/src/index.ts`).
- A reader returns `null` for a file the package does not ship, so one missing item skips one seed item and never fails the seed (`packages/default-content/src/index.ts`).
- Seed vectors keep the encoder's own space stamp. A changed byte or space misses the cache and uses normal inference (`packages/default-content/src/embeddings.ts`).
