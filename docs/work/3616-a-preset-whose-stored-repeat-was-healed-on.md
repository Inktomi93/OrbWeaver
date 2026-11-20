---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: preset
---

# A preset whose stored repeat was healed on read says so

## What

A preset stored with a repeated section key now reads with its first section and drops the rest on the next save, but nothing tells the user a section was dropped.

## Why

A silent drop leaves the user unable to tell why a section they wrote is gone.

## Done when

Opening or saving such a preset shows which repeated section was dropped, and a test covers it.

## Evidence

Filled at landing: what ran and where its output is.
