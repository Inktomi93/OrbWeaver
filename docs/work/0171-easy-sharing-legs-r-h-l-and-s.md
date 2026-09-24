---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: network
plan: easy-sharing
---

# Easy-sharing legs R, H, L and S: restart, relay hosts, pnpm start --share, the Share card

## What

Build legs R (supervisor, supervised restart and the kit key writer), H (the server-owned runtime relay-host registry beside ALLOWED_HOSTS), L (pnpm start --share) and S (the in-app Share card and relay controller: quick tunnel first, Funnel when installed and chosen, a pinned and checksummed cloudflared downloaded on first share) of docs/plans/easy-sharing/design.md, in that order.

## Why

Multi-user is the product's selling point, and friends outside the LAN need a free one-step way in, with https from the tunnel.

## Done when

Each leg's test floor in the plan passes, and a side-eye review covers the Share card at 360 and 1440.

## Evidence

Filled at landing: what ran and where its output is.
