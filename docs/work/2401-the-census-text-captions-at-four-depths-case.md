---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The census-text captions-at-four-depths case counts every caption under load

## What

In the census-text int suite, the case that plants captions at four depths sometimes counts three affected subjects instead of four when the box is under load; it reproduces with the engine files at HEAD.

## Why

A load-dependent count is a flaky instrument: it can hide a real miss or fail a green tree.

## Done when

The case counts four on every run under load, with the cause named (a timing read, a paint not settled, or a pixel ring racing a frame) and fixed in the walker or the fixture, and a repeat-each run under load passes.

## Evidence

Filled at landing: what ran and where its output is.
