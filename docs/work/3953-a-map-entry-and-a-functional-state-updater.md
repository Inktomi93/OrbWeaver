---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A Map entry and a functional state updater credit their tuple

## What

In the unions scan, a literal inside a typed Map constructor's entries and one returned from a functional state updater reach no slot, so they build no member.

## Why

These are lost credits: a member built only this way reads as unwired.

## Done when

A planted case per shape credits the declared key or value tuple, with a twin tuple that stays unbuilt, or a ruling leaves both unread and lists the shapes under the unions report's limits.

## Evidence

Filled at landing: what ran and where its output is.
