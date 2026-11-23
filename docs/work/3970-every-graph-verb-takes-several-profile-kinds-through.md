---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# Every graph verb takes several profile kinds through one parser, and the trial keeps its heap profile on a crash

## What

Graph verbs take one --profile kind per run (wall, cpu or heap), while graph-trial has only its own --cpu-profile option with no heap profile and no wall phases. Nothing saves a heap profile when a run crashes.

## Why

The owner wants the TypeScript profiler used wherever we measure; a crash with no heap profile leaves its memory cause unknown.

## Done when

One shared parser gives every graph verb, graph-trial included, a --profile list of kinds from one tuple (for example wall and heap together); graph-trial's own cpu option is gone; a crashed run still saves its heap profile; planted cases cover a multi-kind run and a crash that keeps its heap profile.

## Evidence

Filled at landing: what ran and where its output is.
