# Transcript sticky identity fix

## Outcome

Identity headers pin within their own message row, including short user messages. The transcript top stays opaque instead of fading below a pinned header. The bottom fade and the short header-backing fade remain.

Tide cancels only its header’s top margin. A negative bottom margin allows its pill to paint beyond its message row.

The height-only attribution payload and its unused public type are removed. Scrollport resize tracking remains for tail re-pinning. The top-edge attribute remains available to owner CSS.

## Behavioral proof

The native suite is `tests/client/features/chat/components/platform-transcript-identity.suite.ct.tsx`. It mounts the production room shell and serves procedures through a corpus-backed production root, as that root’s owner principal.

The fixture edits synthetic messages through `chat.editMessage`: a short user message, a long assistant message, and enough synthetic tail content to reach both row exits. No private conversation text enters the fixture or artifacts.

The suite verifies short-versus-tall geometry, each header’s physical pin position, an opaque top mask, and removal of that header when its own row leaves. Screenshots capture the pinned state for both roles.

Chromium covers desktop and narrow layouts for flat, bubble, echo, whisper, hush, ripple and tide. Document has no speaker identity and retains its actions-only treatment. WebKit covers narrow flat and bubble with the iPhone descriptor; this is Linux WebKit, not physical iPhone Safari.

## Results

- `CT_PORT=3164 pnpm test:ct tests/client/features/chat/components/platform-transcript-identity.suite.ct.tsx --workers=1`: 14 passed, exit 0, no retries, skips or flaky outcomes.
- `CT_PORT=3164 pnpm test:ct:webkit tests/client/features/chat/components/platform-transcript-identity.suite.ct.tsx --workers=1 --grep='(flat|bubble) at 390'`: 2 passed, exit 0, no retries, skips or flaky outcomes.
- Scoped ESLint over the changed TypeScript files: passed with no warnings.
- Scoped Biome over the changed source and suite: passed, no fixes applied.
- `pnpm exec stylelint packages/client/src/styles/globals.css packages/ui/src/styles/primitives.css`: passed.
- `pnpm typecheck packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json`: passed, including the runner’s prerequisite router declarations.
- `pnpm format:docs docs/reviews/transcript-sticky-identity-fix.md`: passed, no changes needed.

Ignored artifacts remain under `reports/user-sticky-header/`. `chromium-qualified.log`, `chromium-qualified-report.json`, `webkit-qualified.log` and `webkit-qualified-report.json` identify the completed runs. `qualified-<skin>-<width>-<role>-pinned.png` names Chromium screenshots.

The browser runners print a recursive preview-process shutdown message after completing their tests. Their completed native verdicts and command exit statuses are successful.

## Failed controls and fixture corrections

- `short-red.log`: the unmodified source fails short-user pin geometry; the header is 61px away from its pin position.
- `fade-red.log`: enabling attribution exposes the mask’s opaque-to-transparent discontinuity at the header bottom.
- `short-green.log`: the initial tail is too short to reach the tracked assistant’s row exit. The fixture adds persisted synthetic tail content.
- `short-green-final.log`: Whisper’s decorative banner precedes its header. The fixture scrolls relative to the actual header.
- `chromium-final.log`: Tide’s negative bottom margin fails the physical row-exit assertion. `tide-green.log` proves the correction.
- `webkit-short-final.log`: Playwright refuses wheel input on mobile WebKit before behavior runs.
- `chromium-frozen.log`: a programmatic initial seek loses to mount-time tail-follow before header measurement. The fixture uses native Home input on a focusable transcript row before the seek. Physical pin and exit assertions are unchanged.

## Limits

The checks use shipped components, a synthetic corpus, no wallpaper, and default palette settings. They do not qualify custom owner CSS, every content type, physical iOS behavior, or a production build. Independent visual review and whole-application verification remain with the orchestrator. Production port 8788 is untouched. The earlier investigation note and ignored diagnostics remain preserved.
