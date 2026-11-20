---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: import
plan: import-robustness
---

# The folder import's multipart parse yields the event loop

## What

Measured on the folder import door: parsing a sixty megabyte multipart upload holds the server event loop for about 280 milliseconds in one stretch, after the chat translation was moved to slices. The details are in the import lane report for item 2188.

## Why

A long hold stalls every other member of the server while a large profile uploads.

## Done when

The multipart parse yields or streams so the worst event-loop gap during a sixty megabyte folder upload stays under the bound the import plan states, measured before and after through the real door.

## Evidence

Filled at landing: what ran and where its output is.
