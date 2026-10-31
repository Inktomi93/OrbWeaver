---
kind: plan
status: done
updated: 2026-10-31
---

# Deleted-key sweep

Result: no live sender of a deleted input key, no restores. The inputs are lenient, so a deleted key would strip silently; none was deleted.

## What was scanned

- Ranges: merges 671f628c46 (1567-1575), 55e62cd255 (1576-1584), 83743b343f (1498, 1502, 0501), 62cce76e51 (1426), 599a4df866 (1520), and branch `wt/agent-a18d2f5789fb50b41` against main (1556, 1572 wire deletes, 1699). 6 ranges, 185 non-test, non-`.d.ts` files under `packages/`.
- Key list: every `-` line shaped `key:` in those diffs, 182 unique names over 263 rows. A second pass listed every removed non-comment line under `packages/server/src/transport` and `packages/contracts` (22 files).
- Literal `rg -w` counts per key across `packages/client`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `packages/server`, `scripts` and `tooling`. Common names (`size`, `model`, `text`, `kind`, `query`) were narrowed by procedure, not trusted by count.
- Excluded: test files, `dist`, `.d.ts`, `node_modules`. Server-internal domain contracts (service params and results that no router returns) were only checked for a router edge, not for readers.

## Input schemas touched

| Procedure | Schema | Lenient or strict | Key removed |
| - | - | - | - |
| `admin.restart` | `z.object` | lenient | none: `confirm` stays in the input, only the service param lost it |
| `admin.revokeUserSessions` | `z.object` | lenient | none (its `.output` was removed) |
| `connection.refreshCatalog` | `z.object` | lenient | none (`signal` is a context value, not a key) |
| `plugin.previewFromUrl`, `previewFromGit` | `z.object` | lenient | none (`caller` is `ctx.auth`, not wire) |
| `provider` and manifest `serves` | `providerDefSchema` | lenient | `"agent"` removed from the task enum; stored rows and manifests parse through `storedProviderDefSchema` / `storedPluginManifestSchema` |

No router input schema lost a key in any range.

## Removed keys that cross the wire

| Key | Removed in | Live sender / reader | Action |
| - | - | - | - |
| `agent` task, `serves: ["agent"]` | 83743b343f | No. `rg` for the quoted literal across client, showcase-plugins, plugin-sdk, tests/e2e, tests/client, scripts: one hit, a comment in `packages/client/src/features/user-admin/components/admin-link-sso-section.tsx:48`. `serves` has zero hits in showcase-plugins, plugin-sdk, e2e | none; stored data keeps loading |
| `peekPrompt`, `previewSection`, `SectionPreview` (`rendered`, `half`, `trace`) | 83743b343f | No. The router comment says both were never exposed; zero hits in every scanned tree | none |
| `revokeUserSessions` output `revoked` | 671f628c46 | No. `packages/client/src/features/user-admin/hooks/use-admin-mutations.ts:61` types the result `unknown`; no read of `.revoked` | none |
| `ChatId` stream `memberBounds` gate (1520) | 599a4df866 | Server-only | none |
| `StoredAsset.size` | branch | No. `packages/client/src/data/upload-asset.ts:57` parses with `storedAssetSchema`; no `.size` read on a stored asset | none |
| `GalleryItemView.mime` | branch | No. `use-character-gallery.ts` and `character-gallery-dialog.tsx` have no `mime` or `updatedAt` | none |
| `GlobalVariableView.updatedAt` | branch | No. Zero client, plugin or e2e hits for the view | none |
| bulk tag failure `id`, `error.code` | branch | No. `packages/client/src/features/character/lib/character-refusal-notice.ts:84` reads `failed[0].error.message` only | none |
| `CharacterDetail.synthetic` | branch | No. No read off a character in client or e2e (the other `synthetic` hits are prose) | none |
| `CharacterSummary.forbidExternalMedia`, `trustHtml`, `backgroundOverride` | branch | No. The client reads them from `CharacterDetail` (`character-hero-band.tsx:44`, `character-appearance-tab.tsx:103`, `use-character-mutations.ts:49-57` patches the `character.get` cache, which still has them) | none |
| `GeneratedGreeting.costUsd` | branch | No. `greeting-studio.tsx` is the only reader; no `costUsd` there (the other client `costUsd` hits belong to stats, discovery and imagery results) | none |
| `SnapshotRef.characterId`, `createdAt` | branch | No. `context-tabs.tsx:360` sends `snapshotId` and `characterId` as input, which are unchanged | none |
| `ConnectionCapabilityView.cacheContext`, `warnings` | branch | No. Zero client, plugin or e2e hits | none |

The output schemas in these rows are strict objects (gallery, bulk tag failure, greeting, snapshot ref, capability view) or `z.object` parsed on the client (stored asset, character detail and summary). A stale server field fails a strict parse loudly; a client read of a removed key would be a type error, and the casts above were checked by hand.

## Not decided or not covered

- The remaining ~150 names are server-internal service params and results (import, embeddings, discovery, assets maintenance, search, rpg, imagery, automation). No router in the scoped ranges changed for them, and none appears in a router `.input` or `.output`. They were counted, not read per reader.
- 1426 moved `WARNING_CODES` and the auth example env rows to named constants; the 21 warning code strings match before and after.
- The branch is unmerged. Re-run this sweep if its contracts change before merge.
