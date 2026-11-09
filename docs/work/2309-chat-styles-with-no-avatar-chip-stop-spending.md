---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a327ea7fc17a97610
plan: cross-surface-consistency
---

# Chat styles with no avatar chip stop spending the avatar gap on an empty rail

## What

On the phone, the document and hush styles show no avatar chip, but their empty identity rail still takes the avatar reach gap (AVATAR_REACH_GAP, 10px where it was 6px), so each loses 4px of text column. Measured in a1723db166, where platform-phone-text-columns records it as RAIL_GAP.

## Why

A gap reserved for a chip that is not drawn takes reading width for nothing.

## Done when

A style that draws no chip takes no chip gap, the text-columns suite drops its RAIL_GAP part for those styles, and the 14px row inset stays.

## Evidence

Filled at landing: what ran and where its output is.
