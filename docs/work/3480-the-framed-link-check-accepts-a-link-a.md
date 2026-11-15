---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The framed link check accepts a link a frame posts just before it grabs focus

## What

`packages/ui/src/content/sandbox-frame/sandbox-frame.tsx` accepts a frame's link message when the page has user activation and `document.activeElement` is the frame. A frame script that posts the message and then calls `focus()` is handled before the focus guard returns focus to the reader, so a scripted reply or card can raise the open-link confirm off a click anywhere in the app.

## Why

The check exists so a link counts only from a click inside that frame. The confirm still needs a press on Open, but a frame can raise it without the reader touching the frame.

## Done when

The link check passes only for a frame the focus guard has admitted as the current holder. A component test with a post-then-focus script raises no confirm and fails before the fix, and a click on a real link in the frame still raises it.

## Evidence

Filled at landing: what ran and where its output is.
