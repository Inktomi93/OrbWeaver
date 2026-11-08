---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# The folder import preview's type hierarchy puts the caveats first

## What

The SillyTavern import preview prints its question in label size, what this folder will skip or leave on disk in gloss size (11px), and generic policy text in reading size (15px), so the specific facts read smallest.

## Why

The skip reasons are the facts a user needs before importing, and they are the least readable text on the page.

## Done when

The preview's skip reasons and caveats read at least as large as its policy text, judged in a capture, and the type steps come from the ramp. Source: acceptance part 1 report.

## Evidence

Filled at landing: what ran and where its output is.
