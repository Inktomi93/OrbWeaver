---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# Bound the size of one page of messages

## What

The stored message cap is per message. `listMessages` pages by row count, so one page of maximum-size messages can be far larger than any client should receive.

## Why

A member who can write long messages can make the room read very large for every other member; this needs a security read.

## Done when

A page of messages is bounded in total characters as well as rows, the client pages through the remainder, and a case with over-size rows proves the bound at the read door.

## Evidence

Filled at landing: what ran and where its output is.
