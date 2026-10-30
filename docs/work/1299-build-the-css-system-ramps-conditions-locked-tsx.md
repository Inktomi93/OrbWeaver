---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: ui
plan: css-system
---

# Build the CSS system: ramps, conditions, locked TSX and theme-aware variants

## What

Build the css-system plan's legs: the primitive ramp tier with semantic aliases, one conditions vocabulary, Tailwind namespace resets that lock TSX to the ramps, stylelint allow-lists over the hand-written CSS, @orb/ui variants built for the theme engine and appearance, ramp values derived from UI law, and the CSS file cleanup. No compatibility shims.

## Why

Values sprawl across role-named tokens, the Tailwind default scale and raw literals, and the same breakpoint and pointer conditions are spelled several ways; nothing forces a surface onto a scale.

## Done when

The plan's legs are built as its Shape states; every control in its Test plan fails on a planted defect; the main surfaces pass side-eye at desktop and phone; whole-tree lint, stylelint and depcruise are green.

## Evidence

The implementation, bounded correctness review and reviewed-slice visual acceptance are complete at `2df42bb1a0`, including the CodeMirror typography and enlarged new-chat footer corrections. The CSS closeout (`reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/css-closeout.md`) and ramp enforcement closeout (`reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/ramp-enforcement-closeout.md`) record the source populations, affected native checks, runtime cases, synthetic captures and their limits. The Import FormDialog was not reached in the capture attempts and is not claimed as visually qualified.

Keep this umbrella open until its explicit current-tree whole-lint and dependency requirements are also satisfied. D317 and the orchestrator merge-train policy leave those whole-tree results to the next authorized push barrier; pre-expansion results do not qualify the changed enforcement/configuration population. The affected Stylelint result is current and passing.

Enlarged-text qualification: `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` mounts the production shell and reads reachable controls (clipped on either axis, past the viewport, or covered at their centre) and cut-off text on the topbar, the room and the character Import dialog at 200% text and 300% layout, on the phone (390x844) and desktop (1440x900) viewports. Its `QUALIFIED` table lists the combinations that pass on Chromium and on the WebKit iPhone project. The scale is the appearance writer's root multiplier; a `rem` in a media query keeps the platform default, so a browser whose own default is enlarged would also flip the shell regime, and that stays a device check.

Open defects found by the same probe, each unfixed because the repair is a layout decision:

- Topbar at 200% on the phone: the list band's Import, New character and Show details controls fall below the 96px header and sit under the Search field. The probe's centre hit test finds them; an edge-only check passed this case.
- Topbar at 300%: Show details and Report a bug sit past the right edge on the desktop; Show details sits past it on the phone.
- Context panel header at 200% on the desktop: Character actions, Close details and the token-count hint sit past the right edge.
- Room composer at 200% on the phone, and at 300% on both viewports: the Try another reply, Generate reply and Continue the reply buttons sit past the right edge, because both composer clusters are `shrink-0` in one non-wrapping row. Wrapping them conflicts with the two-row composer ruling.
- Room at 300%: the Jump to latest button is clipped by its flank row.
- Import dialog at 300% on the phone: the viewport gutter token is 2rem, so a 390px phone keeps a 198px sliver, the title wraps per letter and Cancel is cut.
- Character list panel at 200% and 300% on the phone, and the panel regimes on the desktop at 300%: the probe could not reach the library rows after the scale was applied. This is unqualified, not a confirmed defect.

Device-only items stay open: real iOS keyboard with the dynamic viewport, notch insets including the bottom edge, standalone status bar, Dynamic Type and Safari punctuation and wrapping.
