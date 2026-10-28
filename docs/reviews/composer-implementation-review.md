# Composer implementation review

## Status

Implementation, rendered corrections and local verification are complete. Nothing is pushed or deployed.

The [approved composition](composer-mock-study.md) owns the design and owner authorization. [Reading intent](../law/UI-Theming-and-Content.md#chat-style-reading-intent) defines the skin differences.

## Implemented behavior

- The composer has tool and attributed plugin menus beside grouped generation actions, above Chat options, the draft and Send.
- Group chats retain speaker selection and link to the existing chat settings editor.
- Ordinary plugin panels share Context. Each panel collapses independently and can move to an explicitly selected sidecar.
- Moving panels transfers keyboard focus to a stable return control or the restored disclosure.
- Appearance defaults select Flat and small rounded avatars. Stored valid overrides remain valid; the owner permits replacing his own preferences.
- Sticky identity and actions remain, with Document's intentional identity exception. Header fades and the visible edited timestamp are removed.
- Whisper's banner preserves its authored aspect ratio within a governed viewport budget.
- Game actions use a compact icon and count. Incomplete outcomes say “needs attention”; expanded details retain the actual verdicts.
- Snap derives its default appearance profile from the production schema. Its source census supports source archives without disabling enforcement.

## Completed evidence

Tests mount production composition through testkit. Settings are schema-derived with explicit case overrides, not inherited owner appearance.

| Scope | Completed evidence |
| - | - |
| Composer layout, group controls, active drafting and refusal | Chromium and WebKit production-room cases passed with explicit defaults and actual chat-settings navigation. Keyboard cases prove Card containment, separate refusal copy, non-overlapping touch targets, internal scrolling and restored height. |
| Plugin commands | Native guest arguments, invocation, draft replacement and Undo passed in the main affected run. |
| Plugin panels | Context, independent collapse, placement persistence, hidden restore, keyboard focus and mobile sidecar cases passed. |
| Reading geometry | All viewport/style cells have passing evidence across scoped runs, including both roles. This is not a claim of one clean matrix run. |
| Appearance and placement contracts | Defaults, stored overrides and profile parsing cases passed. |
| Owner CSS | The edited-slot retirement and generated surface checks passed. |
| Tooling | Schema-default response patching, archive census and the existing custom-property ESLint cases passed. |
| Compiler programs | Contracts, UI, client, tooling, Node tests and browser tests passed after scoped fixture corrections. Final changed programs passed; CSS lint passed. |
| Independent code review | Integration, panel focus, tooling and corrected game-action summaries have no remaining reported findings. |
| Dependency direction | The final full dependency-cruiser run passed without violations. |

Final browser artifacts and compiler logs are retained privately under `reports/surface-review-private/composer-final/`.
Earlier failed runs remain under `reports/surface-review-private/reading-geometry-*`; they are not reported as passing runs.
Review reports are under `reports/stickler/`.

## Rendered acceptance

The corrected captures use the isolated application stage, the owner's private database clone, schema-default appearance and an explicit reference theme.

- Long landscape drafts remain above the emulated keyboard. The draft scrolls inside the composer instead of escaping its Card.
- Whisper retains its authored banner aspect while preserving short-height reading space.
- The empty game-status decoration uses the existing smallest display step. Freshness, help, shortcuts and populated state remain available.
- The transcript bottom fade stays shallow. The sticky top remains opaque.
- Desktop captures cover both docked panes, each pane alone, both hidden, and an explicitly selected sidecar.
- Wide sidecars reserve their own column. Narrow fine-pointer sidecars retain the existing transient overlay policy and close through Escape or outside press.
- Independent screenshot review closes the original findings without deferred visual corrections.

The private evidence index is `reports/surface-review-private/composer-final/evidence-index.json`. The focused aesthetic report is `reports/side-eye/2026-10-26-composer-plugin-reading.md`.

## Evidence limits

Physical iPhone gestures, Safari browser chrome and real on-screen keyboard behavior are not established by browser emulation.

The final stage's first cold navigation exceeded application readiness before the authenticated shell mounted. That failed run remains preserved and unqualified.
Auth and application reads completed promptly; cold module loading is the supported inference, but the exact module lacks trace evidence.
Settled layout captures do not convert that failure into cold-start success. A separate session watchdog timeout is also retained as an instrument failure.

Console timing annotations remain recorded. Input-adjacent shifts and the sanctioned disclosure-height animation are distinguished from bootstrap timing observations.
These captures do not certify production performance or complete accessibility. The measured composer placeholder contrast passes.

The pre-polish phone image index is `reports/surface-review-private/reading-pre-polish-artifacts.json`.
Its captures cover each mode in portrait and landscape. They use a fixed isolated application stage; per-run working-tree identities also include concurrent authoring changes outside that stage.
The filename word `final` does not establish final-source qualification. The index explicitly records this scope.
