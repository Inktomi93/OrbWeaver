---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: ui
lane: wt/agent-a077f0d1825cbd015
---

# Add-document raster offsets align to the device grid

## What

The blurred Add-document popup and its FileDropzone text boxes have fractional owned offsets on desktop. Popup placement belongs to packages/ui/src/primitives/dialog/dialog.tsx; content layout belongs to packages/ui/src/primitives/file-dropzone/variants.ts.

## Why

Promoted content inherits off-grid placement and loses text crispness. This finding is separate from the approved functional launch cut.

## Done when

Popup and contained text origins land on device pixels across the governed DPR cases. Centering, modal focus, mode positions and phone containment remain unchanged.

## Evidence

The reviewed ref is `7d4018247819c2c7956fddd34f844ea7714e7d90`. Independent rendered runs `2557675` and `2579223` show the popup and child offsets. The unmodified-source probe `3523826` fails at DPR 1, 1.25 and 3; DPR 2 passes. The owner deferred this cosmetic finding outside the functional launch cut. No product repair or severity change is claimed.

Owner ruling: closed as the integer-line-boxes §2 runtime residual. A centered CT probe measured popup top 300.5 (199px odd intrinsic height) and fails at DPR 1, 1.25 and 3 while passing at 2. Integer CSS offsets cannot land on the 1.25 grid without quantizing every dialog's centering, which this item forbids.
