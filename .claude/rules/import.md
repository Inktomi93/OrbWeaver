---
paths:
  - "packages/server/src/domain/import/**"
  - "packages/server/src/entry/import/**"
  - "packages/server/src/entry/http/import*.ts"
  - "packages/server/src/infra/storage/stage*.ts"
  - "packages/server/src/primitives/serde/**"
  - "packages/contracts/src/import/**"
  - "packages/contracts/src/portability/**"
  - "packages/client/src/features/workloads/**/*import*"
  - "packages/client/src/features/character/components/character-import-dialog.tsx"
  - "tests/server/domain/import/**"
  - "tests/server/entry/http/import*"
  - "tests/server/infra/storage/**"
  - "tests/server/primitives/serde/**"
  - "tests/contracts/import/**"
  - "tests/client/features/workloads/**/*import*"
  - "tests/client/features/character/components/character-import*"
---

# Import and portability

- A character's identity is `cardImportHash` over the parsed card, its embedded book and its art, never its name or file bytes. Look one up through `findImportedCharacter` (D290).
- No import updates or deletes an owned row. Equal content reuses the row; different content under a taken name lands beside it, and a character suffixes only its handle (D290, D312).
- Keep one parser per entity in `packages/server/src/primitives/serde/`; the collector and the single-file doors call the same function (D290).
- Import writes no table: hand each write to the owning domain's injected op (`packages/server/src/domain/import/verbs/import-character.ts`). Policy `domain-no-host-io` refuses a runtime host I/O import from a domain.
- Only `restoreCharacterBook` replaces an embedded book; a re-upload never reverts the owner's book edits (`packages/server/src/domain/import/verbs/restore-character-book.ts`).
- One bad item never fails a profile run: record it with its reason. Keep the file read outside the per-item catch, so a storage fault still ends the run (`packages/server/src/domain/import/loader/collect.ts`).
- Narrow every plane a card carries at the parse, so a refused plane leaves no character behind (`packages/server/src/domain/import/substrate/card.ts`).
- A failed card carries a `reason` code for the client to key on; the client never shows the server's `error` text (`packages/contracts/src/import/card-result.ts`).
- Every name in a file is hostile: clip it, name a skip by its profile-relative path, render it as plain text (`packages/contracts/src/import/preview.ts`).
- A dry run asks each owning domain's read-only twin of the write, and a verdict belongs to the collected entry, not its path (`packages/server/src/domain/import/loader/profile-ownership.ts`).
- Only an upload route mints staged params (D340). A staged handle is a name, not a capability: resolve it under the row owner's root (`packages/server/src/domain/import/substrate/staging.ts`).
- Read staged bytes only through the manifest digest (`packages/server/src/infra/storage/staged-manifest.ts`). Compare containment by `realpath` and `lstat`-refuse a symlink before `rm` (`packages/server/src/infra/storage/staged-paths.ts`).
- Free a staged upload on every path that ends a row before its body runs (`packages/server/src/domain/import/workload-contributions.ts`).
- A chat bundle needs a character on this account: refuse and name the handles, never mint a placeholder. Drop a cross-plane reference that does not resolve; never write it at a guess (D136).
- Resolve a SillyTavern group member by card filename, never by display name (`packages/server/src/domain/import/substrate/group.ts`).
