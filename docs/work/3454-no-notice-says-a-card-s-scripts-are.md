---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: cross-surface-consistency
---

# No notice says a card's scripts are off

## What

A card renders in its frame with its own scripts dead when its character resolves below the Interactive step, when the install's interactive ceiling is down, or when the viewer turned card scripts off. The card looks finished but its controls do nothing, and nothing says why. The posture is decided when the frame is minted, and telling a card that needs script from a static one needs a parse of its markup.

## Why

A reader presses a control in a card and nothing happens. The plain-content notice covers untrusted HTML only.

## Done when

A card or styled reply whose markup carries script or a script-driven control, and whose frame is script-dead, shows the shared notice with the reason and the one setting that changes it. A static card shows none. The detection is one pass over the markup with a stated cost, and component tests cover a scripted card on each posture and a static card.

## Evidence

Filled at landing: what ran and where its output is.
