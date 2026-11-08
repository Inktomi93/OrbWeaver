---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# Remove em dashes from feature UI copy

## What

Feature UI strings in rpg, chat, preset, user-admin and other features still use em dashes in labels, notices and accessible names. The persona feature, shared components, forms, app-shell, auth, home, notifications and @orb/ui are already clear. Replace them with the punctuation the copy rules name, and keep developer diagnostics as they are. Acceptance part 2 also found em dashes in packages/client/src/data/new-room-persona-notice.ts, packages/client/src/lib/chat-rename-names.ts, the chat topbar Members and Memory chip names, and the Home section tooltips; the client data and lib folders are in scope.

## Why

Chrome copy that mixes em dashes with the rest of the product reads as two voices, and the persona review found the pattern across features.

## Done when

No user-facing string under packages/client/src/features or packages/ui/src holds an em dash, apart from developer diagnostics named with their reason, and no test asserts a removed spelling.

## Evidence

Prose copy under packages/client/src/features, data and lib and packages/ui/src no longer holds an em dash. Each string takes a colon, period, comma or parentheses by meaning. Tests that asserted a changed spelling are updated. The state/ copy in game-mode-transition.ts, section-list-projection.ts and the "Message tools" label in tests are covered in the second pass.

Kept developer diagnostics:

- packages/client/src/lib/notify.ts:58, trpc-devlog.ts:72, bus-devlog.ts:89 and :141: console output.
- packages/client/src/lib/motion-flaggers.ts:251,252,380,417 and bug-report-bundle.ts:30,33: dev flagger and bug-report reasons.
- packages/client/src/data/upload-asset.ts:23 and http-error.ts:23: thrown error messages. fetch-automation-fires.ts:22: debug route reason.
- packages/ui/src/lib/class-merge.ts:322 and virtual-gap.ts:62: dev error and warning text.
- packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts:51,146: sandbox guest errors.
- packages/client/src/features/app-shell/lib/bug-report-capture.ts:51,256: bug-report reasons.
- packages/client/src/features/plugin/components/plugin-surface-renderer.tsx:78,80: console warning for plugin authors.
- packages/client/src/lib/chat-title.ts:20: regex that matches stored imported titles.
- packages/client/src/state/device-local-registry.ts: rationale strings that no UI renders.
- packages/ui/src/tokens/tokens.json, packages/ui/src/tokens/themes/\*.json, packages/ui/src/styles/theme.css: developer descriptions and a generated header.

Kept placeholder glyphs. A lone "—" that means "no value" is a glyph, not sentence punctuation, so it is outside this item. A separate item moves the copies to one home. Sites:

- packages/client/src/features/stats/lib/analytics-view-model.ts:59
- packages/client/src/features/stats/components/rhythm-figures.tsx:25
- packages/client/src/features/stats/surfaces/analytics-overview-surface.tsx:155,156,160
- packages/client/src/features/rpg/lib/unset-datum.ts:2
- packages/client/src/features/discovery/components/corpus-compare-tab.tsx:264
- packages/client/src/features/preset/lib/format-count.ts:29
- packages/client/src/features/refinery/components/payload-view\.tsx:61
- packages/client/src/features/chat/components/assembly-preview-diagnostics.tsx:341
- packages/client/src/features/chat/components/swipe-strip.tsx:196
- packages/client/src/features/chat/components/greeting-swipe-strip.tsx:88
- packages/client/src/features/chat/components/regex-tier-row\.tsx:49

Checks: pnpm test tests/client, edited CT files with pnpm test:ct, pnpm typecheck for the client and ui tsconfigs, scoped biome and pnpm lint:eslint.
