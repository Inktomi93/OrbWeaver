---
kind: bug
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# e2e specs assert copy text instead of production constants

## What

Existing e2e specs match literal copy such as Start a temp chat and No chat selected, and the render-truth spec clicks a literal Settings instead of importing the label constant.

## Why

Spine-Testing section 10 imports labels from their production home; a copy literal makes tests fail on wording changes and pass on behaviour changes.

## Done when

Selected specs locate controls by test id, role or the production label constant. Assertions still prove behavior, not only that a label renders. Apply this with the owning replacement cases.

## Evidence

The selected specs are `smoke.spec.ts`, `corpus-home-launch.spec.ts` and `live-settings-render-truth.spec.ts`.

- The launch names live in `packages/client/src/lib/chat-launch-names.ts`. The chat landing, the new-chat picker, the topbar badge and the temp-chat tile render from it, and `@orb/client/lib` exports it. The chat feature door cannot host it: a spec's Node side loads that door's stylesheet imports and fails collection.
- Render-truth reaches Settings through `CONFIG_SECTION_LABEL` and Appearance through `appearanceGroup.label`. Its breaker check needs a mounted `config-save-footer` status, then proves that no save readout is in its `role="alert"` failure arm. The "Saved" and "Retry" copy is gone.
- Smoke drops the not-found copy and keeps the `data-app-failure` declaration. Its home error check read copy that production no longer renders, so it could never fail. It now counts `query-error` blocks inside the home landmark.
- The temp-chat launch also reads the started room through `chat.getChat` and requires `temporary`. The picker's teaching sentence is no longer asserted.
- Proof: `pnpm exec playwright test --list` collects all three files, 13 tests. `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` passes. The e2e run needs the stack and is owed.

Other specs still locate controls by literal role names. This item does not cover them.
