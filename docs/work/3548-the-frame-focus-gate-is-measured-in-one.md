---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# The frame focus gate is measured in one browser engine

## What

Link admission and the grab loop stop are measured only in Chromium. The component test configuration runs a fixed file list in WebKit and Gecko is not installed. One residual rests on the order a browser fires blur in.

## Why

The decision records claim the gate only where it was measured.

## Done when

The sandbox frame gate cases run in WebKit and Gecko, or the configuration says why they cannot, and the decision record names the engines measured.

## Evidence

Filled at landing: what ran and where its output is.
