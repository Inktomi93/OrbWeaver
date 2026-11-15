---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The framed link confirm does not mark the registrable domain of a long host

## What

The confirm a framed card or reply link raises shows the whole host on its own line. A host whose first labels name a known site and whose registrable domain comes last still reads as the known site from the left. Marking the registrable domain needs the public suffix list.

## Why

The confirm is the last control before the reader leaves the app, and a host is read left to right.

## Done when

A ruling on shipping a public suffix list, with its size and update path, or an accepted residual stated in D354. If shipped, the registrable domain is marked and a component test under `tests/client/features/chat/components/` covers a suffix of several labels.

## Evidence

Filled at landing: what ran and where its output is.
