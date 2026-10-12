---
kind: tooling
status: open
updated: 2026-10-12
priority: P2
area: tooling
---

# snap motion catches a view-transition flicker and never reports a silent near-empty window

## What

Three faults. (1) A selector-less --motion opens after the click and after \_\_orb.resetEvidence() (the snap motion module (motion.ts in tooling/src/snap/ops, found by name):105-120), so it measures a static page; the right spelling is --motion '<selector>', which recorded 168 frames where the selector-less run recorded 2. The snap-driving skill has no placement rule, and .claude/agents/side-eye.md:36 says zero frames means the instrument failed, which contradicts motion.ts:5-15. Add the placement rule to the skill and rewrite that line. (2) The preceding-input hint prints only on a gap (tooling/src/snap/lib/motion-gaps.ts:37-39), and 2 to 19 frames counts as collapsed, not a gap (tooling/src/motion-audit/lib/evidence.ts:129-131, verdicts.ts:32-37), so a near-empty window reports RECORDED with no hint. Raise the hint whenever measured input is false, inputs preceded the window, and the frame population is not a verdict (motion.ts:159-165), with a planted two-frame test row. (3) --motion judges long frames, layout shift, dirty animations and dropped compositor frames (motion-problems.ts:59-155; trace frames from motion-audit/ops/trace.ts:30-47); it reads no opacity, and --filmstrip refuses to run with it (filmstrip.ts:161) and samples in bursts, so a 90ms crossfade flicker is caught by luck. Add a vt-crossfade channel: per animation frame, read getComputedStyle(html, '::view-transition-old(root)').opacity and the new twin from startViewTransition until finished, recorded through \_\_orb in packages/client/src/lib/view-transition.ts, and judge monotonic fade and end state. The phone-nav review's hand sampler is the prototype.

## Why

The 866 crossfade flicker passed snap and was caught only by a reviewer's hand-built sampler; reviewers concluded the instrument was broken when it was misused, and the instrument stayed silent about it.

## Done when

The skill and side-eye role state the --motion selector rule; a near-empty window prints the hint and exits non-zero, proven by a planted row; the vt-crossfade channel flags a planted opacity return in a view transition at high load and passes a clean fade; tests cover each.

## Evidence

Filled at landing: what ran and where its output is.
