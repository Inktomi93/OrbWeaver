---
kind: work
status: open
updated: 2026-09-24
priority: P2
area: network
plan: easy-sharing
---

# Easy-sharing legs D and F: the Docker quick tunnel and Tailscale Funnel

## What

Build legs D (the Docker quick-tunnel path) and F (Tailscale Funnel) of docs/plans/easy-sharing/design.md after legs T to J.

## Why

The Share flow must work the same way in Docker, and Funnel is the robust option for hosts who run Tailscale.

## Done when

Each leg's test floor in the plan passes, with a live proof on a throwaway Docker volume.

## Evidence

Filled at landing: what ran and where its output is.
