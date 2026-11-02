---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
---

# The background-upload CT fails on main: the saved upload record is missing

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Cause: the test's stubbed upload reply carried an undeclared `size` key. 483c35de84 (every wire object declares its unknown-key mode) made `storedAssetSchema` a strict object, so the client's `uploadAsset` refused the reply, `BackgroundUploadField` showed its upload error, and no library entry was ever handed up, so the save never fired. The product is right: the real route returns exactly a `StoredAsset` (`assetId`, `hash`, `created`) and never sent `size`. The test invented a wire shape. It was not the T5/T7 brand commits, 1815 or the short-room merge.

Fix: the test now builds the reply as `satisfies StoredAsset`, so the stub follows the contract. Red on the parent, green after at 5 of 5 with `--repeat-each=5`; `appearance-sizing-preferences.ct.tsx` also passes.

`tests/client/features/app-shell/components/background-upload.ct.tsx:34`: `toMatchObject` receives `undefined` from `saved.at(-1)`. It fails on main at 8476858b56, 74545057a3 and 610ce8014e, before and after 1815, and it reproduces alone. Find the commit that broke it, then fix the product or the test, whichever is wrong.
Lead: the last commits to touch the test or its component are the type-law T5/T7 commits (132fb27c36, fa46d7a2e6, branded ids through their slots). Start there.
