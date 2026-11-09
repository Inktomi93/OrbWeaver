---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: chat
lane: wt/agent-aeeecdd1ff632fbb2
plan: cross-surface-consistency
---

# Decorative message art covers the message edit controls at enlarged text on the phone

## What

In the echo reading style at 200% the art reservation (an absolute, aria-hidden button) covers Save edit; in the ripple style at 300% the avatar overlay covers Save edit.

## Why

A phone user at enlarged text cannot save an edited message in those styles.

## Done when

Save edit is clickable at 200% and 300% on chromium-phone-portrait in every reading style; the echo and ripple original canon reading cases pass their edit step there.

## Evidence

Part, in fc90fda367: echo's Save edit at 200% is clear because an edited row passes no art view. Ripple at 200% and 300% is open, held as test.fixme cells in platform-enlarged-reach. Ruling (claude-b under delegation): the ripple phone portrait width token becomes container-relative, measured at 320 and 390, and the fixme cells turn on.
