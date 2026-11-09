---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# A direct logger call with a plain typed value reaches the log receiver

## What

base.debug({ ...direct }) with an inferred plain type sorts dead, because an inferred T is not an open slot and isLogCall in open-sends.ts is never reached.

## Why

The unwired item asked that library logger calls class as ask with a log receiver, and this shape escapes it.

## Done when

A fixture case with a direct typed logger argument sorts ask log pino, red before the fix.

## Evidence

Filled at landing: what ran and where its output is.
