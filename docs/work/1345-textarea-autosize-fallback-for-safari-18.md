---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: ui
plan: css-system
---

# Textarea autosize falls back to script below field-sizing support

## What

The Textarea primitive and the topbar rename field grow through `field-sizing: content`, which Safari ships from 26.2. On the Safari/iOS 18 browser floor (owner ruling, leg 8), the composer keeps its `rows` height and scrolls instead of growing.

## Owner ruling

2026-10-24: add a script fallback inside the primitive.

## Done when

The Textarea primitive keeps `field-sizing: content` where `CSS.supports("field-sizing", "content")` is true and otherwise measures and grows its box in script, within the same min and max rows, with no layout shift on first paint; callers do not change; a CT forces the unsupported arm and asserts growth matches the supported arm's height.

## Evidence

- `packages/ui/src/primitives/textarea/use-field-sizing-fallback.ts` holds the script arm; `textarea.tsx` puts its ref on the field. Where `CSS.supports("field-sizing", "content")` is true the hook does nothing. Otherwise it sizes the box at mount (in the commit, before paint), on input, on each commit and on a width change. The size is set as `height`, so `min-height` and `max-height` (the `rows` and `maxRows` styles) clamp it; a caller that fixes the height keeps it. Callers do not change.
- `tests/ui/primitives/textarea/textarea-autosize.ct.tsx` forces the unsupported arm (`CSS.supports` answers false and the native property is switched off) and compares the box with a clone sized by the native property, at mount and for empty, four-line and twelve-line text. With the script arm disabled it fails 23px short at mount; with it, it passes.
- The topbar rename field is not changed. Measured on the real shell (`app-shell-topbar.ct.tsx` room rename): `field-sizing` computes to `content`, but the input's authored inline size is `100%`, so the property never sized it (173px, the group's width). Its behaviour on Safari 18 already equals the supported one. `chrome.css` still carries the no-op declaration; removing it is a separate cleanup.
- Ran: `textarea-autosize`, `platform-room.suite`, `app-shell-notices` and `app-shell-responsive` CTs (24 pass); eslint and biome on the touched files; typecheck of `packages/ui`, `tsconfig.tests-dom.json` and `tsconfig.json` (only the 17 errors already present in `app-shell-ct.ts`); `knip:prod` and `depcruise` clean.
