---
kind: bug
status: doing
updated: 2026-10-28
priority: P1
area: client
lane: plugin_inventory_finish
plan: surface-walk
---

# Make ordinary Chat history reachable beyond its latest page

## What

OrdinaryThread requests only the default listMessages page and exposes no older-history path. Add production pagination through the existing contract and preserve the virtualized reading position.

## Why

The owner-data walkthrough cannot reach original canon messages in any message mode because ordinary Chat admits only its latest page.

## Done when

Use a production-composed test with more than one page. Reach older original messages through the actual UI, preserve the reading anchor on prepend and live arrivals, and verify room switching on desktop and mobile. Keep the original-canon walkthrough obligation.

## Evidence

Filled at landing: what ran and where its output is.
