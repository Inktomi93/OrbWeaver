---
kind: tooling
status: open
updated: 2026-11-21
priority: P2
area: tooling
---

# A snap stage can reach the local model for live-turn review

## What

A ux-reviewer on a snap stage could not add the local model at 127.0.0.1:8900 because the cloned settings allow only host.docker.internal as a private endpoint, so live-turn surfaces could not be reviewed.

## Why

Notices, the Stopped mark and turn-time states need a live turn to review.

## Done when

A snap stage allows the box's local model endpoint without an owner settings edit, and the snap-driving skill names how a reviewer starts a live turn.

## Evidence

Filled at landing: what ran and where its output is.
