---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a2c682ad8003e0eaf
plan: cross-surface-consistency
---

# The Characters selection bar covers rows and pushes its own Delete off the screen at 300% text

## What

On the phone at 300% text the sticky selection bar wraps so tall that it covers the next row's checkbox, and its bulk Delete lies outside the viewport.

## Why

A phone user at 300% text cannot select a second card or reach bulk Delete.

## Done when

The row checkboxes and the bar's Delete are clickable at 300% on chromium-phone-portrait; Characters independent trust-actions and commands pass there.

## Evidence

Filled at landing: what ran and where its output is.
