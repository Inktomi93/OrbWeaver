# Motion and scroll regression closeout

## Outcome

The affected component selection passes: 32 cases. This batch changes test apparatus and fixture fidelity only. Production source, durations and tail thresholds are unchanged.

The motion failure is an observation race: the existing test waits through real animation frames and can inspect the reference after it finishes. The replacement holds the native document animation timeline at a measured, nonzero phase.

The original CI jump-pill failure remains unexplained. The original wire-repetition case passes locally, including its native-event diagnostic. The stronger persisted-message and published-event cases pass normally and under browser CPU throttling. These observations do not establish a production root cause or a flake classification.

## Motion proof

`app-shell-motion.ct.tsx` uses a local disposable CDP clock resource. It enters at a slow playback rate, waits for an actual CSS phase above 2ms, then freezes the whole animation timeline. Animation frames and React continue running.

Both mid-door cases retain their non-null reference, nonempty newcomer and less-than-1ms phase assertions. They also assert the nonzero reference phase. No test seeks an individual animation. Production durations and newcomer timing are untouched. Disposal restores playback and detaches the session.

The native clock diagnostic records the original start time unchanged while the timeline is frozen. Animation frames advance, and an untouched newcomer naturally starts at phase zero. Removing the production join assignment causes both cases to fail the phase assertion, with differences of 2.016ms and 2.000ms. The original production file is restored before final verification.

CDP virtual-time budgets alone are unsuitable here: JavaScript time advances while the CSS timeline and frame count remain unchanged. That rejected diagnostic is retained.

## Jump proof

The case now mounts the existing `ChatRoomShellStory` with its production socket hook. It resumes a real corpus root and seeds history through `chat.commitMessage`. A subsequent commit produces a durable `messageCommitted` event, carried through the existing socket edge helper and production event path.

The corpus provider script supplies only external provider execution. Native embedding, persistence, event publication, message reads and rendering remain production-owned. The subscription has abort and joined teardown, and the success path unmounts the actual component.

Both capability variants retain the away-reader and one-new-message assertions. The jump must reach the physical tail within one pixel, reveal the persisted message's actual ID and remove the pill. The obsolete revision-invalidation story is removed.

The absent-scrollend profile removes Element, Window and Document capability carriers and blocks event delivery. The case asserts the advertised profile after mount. The installed virtualizer reads Window capability, although its native-scrollend option defaults off; the application hook reads the element capability.

A temporary sticky-away updater in the actual production hook preserves initial-tail, away-reader and counter setup. Both variants then reach the strict physical tail and reveal the committed message, but fail the post-jump pill-removal assertion. This establishes fixture sensitivity, not the cause of the original CI failure. The original hook is restored before final verification.

## Evidence

The starting checkout is `36f94b6835`; final checks include the independently integrated test-only changes through `985bb9cf40`.

Ignored native artifacts are under `reports/ci-motion-scroll/`:

| Artifact | Verdict |
| - | - |
| `artifact/` and `component-results.zip` | Original CI traces and failure contexts |
| `native-clock-probe.log` | Virtual-time budgets do not advance the required CSS timeline |
| `native-animation-clock-probe.log` | Nonzero frozen phase, unchanged start time and continuing animation frames |
| `jump-diagnostic/report.json` | Original wire case passes; both final physical distances are zero |
| `real-flow-positive/report.json` | Motion cases pass; jump setup refuses unscripted embedding execution before mount |
| `wrong-join-real-flow/report.json` | Intended phase failures; persisted jump variants pass |
| `real-flow-cpu4/report.json` | Persisted native-scrollend case passes at CPU rate 4; final event geometry has zero tail distance |
| `scrollend-capabilities.log` | Native capability carrier locations |
| `sticky-away-control/report.json` | Intended post-jump pill failures after strict tail and message-identity assertions |
| `final/report.json` | Final affected selection passes |

The diagnostic JSON attachments retain actual native handler registrations, invocations and geometry. Handler identity is compiler-stable, but the primitive DOM-ref bridge still removes and re-adds listeners during renders. No diagnostic establishes that this caused the CI failure. Temporary telemetry and mutations are absent from the committed source.

## Verification

| Command | Result |
| - | - |
| `CT_PORT=3165 pnpm test:ct tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx tests/client/features/chat/components/jump-to-latest.ct.tsx tests/client/features/auth/components/login-pending-join.ct.tsx tests/client/features/chat/anchors/join-invite-dialog.ct.tsx --workers=2 --output=reports/ci-motion-scroll/final` | 32 passed |
| `pnpm typecheck tsconfig.tests-dom.json` | Passed, including the router dependency |
| `pnpm lint:eslint tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx tests/client/features/chat/components/jump-to-latest.ct.tsx` | Passed |
| Native dependency-cruiser over the changed component specs | Passed |
| `pnpm knip` | Passed; obsolete story removal has no remaining consumer |
| Scoped Biome and `git diff --check` | Passed |

Native diagnostic commands use the same component entry point with bounded named selections. Their full logs and selected paths are retained beside their reports. Each runner reads a frozen source tree. No retry, warm-up navigation, timeout increase, baseline or suppression supplies a passing verdict.

## Limits

These are Chromium component tests through the production gallery pipeline, not fresh production E2E results. The orchestrator owns independent review and any qualified reuse of existing E2E evidence. The full CI population is not rerun in this lane.
