---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: client
lane: wt/agent-a4fe6241d109f14ce
plan: cross-surface-consistency
---

# Rule whether one header template serves DetailHeader and MemberDrillHeader

## What

The census keeps the DetailHeader and MemberDrillHeader split, cited to their file headers: the two regimes differ (CSS defer against the mobile viewport script). Decide whether one header template serves both a subject and a drilled member.

## Why

Two header templates for one role are a second home unless the regime difference is a ruling.

## Done when

Ruling: merge onto one template. Both headers draw one role, a content pane's identity row, and differ only in how they stand down where the narrow topbar already prints the name; the CSS defer mark in the shell is the shared owner and the script branch on the viewport goes. DetailHeader takes an optional leading Back and an optional title, and the Back and the visible name carry the defer mark. No caller of MemberDrillHeader remains and the file is gone. Component tests show, on the production surfaces: the desktop drill draws Back, name, meta and verbs on one row with one h2; the phone regime shows no Back and no visible name while the h2 stays in the outline and the verbs stay reachable; the pending and error states show the Back alone. Kept from the drill header: Back sits outside the member's suspense boundary, no lifecycle chrome on the row, and the home stays client-shared. The plan's Detail header row names one template.

## Evidence

Filled at landing: what ran and where its output is.
