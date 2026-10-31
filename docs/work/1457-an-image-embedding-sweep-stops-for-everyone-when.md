---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: embeddings
---

# An image embedding sweep stops for everyone when one asset file is missing

## What

When an asset row exists but its stored file is gone, embedAssets throws ENOENT and the whole sweep fails (packages/server/src/domain/embeddings/verbs/). Ruling: a vanished file fails that asset, the sweep continues, and the run records the failed asset so the owner sees it.

## Why

One corrupt or deleted file stops every other asset's embedding, and the failure names nothing the owner can act on.

## Done when

A sweep over a set with one missing file embeds the rest, records the missing asset as failed with its id, and a server integration test through the composed root proves it, red on current main.

## Evidence

- `tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts`, case "an avatar whose stored file is gone fails alone": removes one stored blob, runs `embedAssets` through the composed root. Red on the old sweep with the ENOENT; green after, returning `failedAssets` with the asset id and embedding the other asset.
- `packages/server/src/domain/embeddings/indexer/image.ts` raises `AssetFileMissingError` only where the blob is read; `packages/server/src/domain/embeddings/verbs/embed-assets.ts` fails that asset and lets every other error stop the sweep. The ENOENT detection is `isMissingFile` in `packages/server/src/primitives/errno/index.ts`, shared with the cas, secret-file, export-character and relay-binary callers.
- The same persistence file holds the guard case: a refused vector write stops the sweep, and the sweep embeds both avatars once the refusal is lifted. Red against a catch-all in `indexOne`.
- `packages/client/src/features/workloads/components/workload-failed-assets.tsx` names each failed asset on the job row, by the character whose avatar it is, else by the image id. `tests/client/features/workloads/components/failed-assets.ct.tsx` runs a real index workload with one blob removed and reads the names on the row; red with the component removed.
- `failedAssets` is an optional readonly array on `EmbedPassResult` in `packages/contracts/src/embeddings/index.ts`; the client run summary tallies it.
- Typecheck of `tsconfig.node.json`, `packages/server` and `packages/client`, ESLint, whole-tree depcruise and `pnpm knip:prod` pass.
