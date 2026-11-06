---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# SillyTavern import preview keeps identity across profiles and same-named orb books

## What

Keep import preview identity separate per SillyTavern profile and per same-named Orbweaver book.

## Why

A preview entry must keep the identity of the profile and the Orbweaver book it came from, or counts for different sources merge into one.

## Done when

A test previews two profiles that hold a same-named book, and the preview shows separate entries with separate counts.

## Evidence

Filled at landing: what ran and where its output is.
