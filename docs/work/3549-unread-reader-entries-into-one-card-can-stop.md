---
kind: decision
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# Unread reader entries into one card can stop its scripts

## What

Refused focus entries now count until a press or Tab in the app. A screen reader whose focus follows its cursor can enter one card several times with nothing in the app between, and the gate stops that card's scripts with no sign.

## Why

A screen reader user can lose an interactive card's scripts for that mount.

## Done when

A ruling that the cost stands and the scripts-off notice names it, or a readable signal from the reader that starts a new run, with a component test.

## Evidence

Filled at landing: what ran and where its output is.
