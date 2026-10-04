---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: connection
---

# Adding the first chat model binds the Chat role

## What

First-model setup binds Chat only on Finish (first-model-setup.tsx), so closing it early leaves every role Not set and rooms say no connection can chat. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

The first chat-capable connection gets the Chat role even when setup closes early, with a 'Change' link, with a test.

## Evidence

Filled at landing: what ran and where its output is.
