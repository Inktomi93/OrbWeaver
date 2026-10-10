---
kind: bug
status: doing
updated: 2026-10-10
priority: P1
area: collections
lane: wt/library-responsiveness
---

# Repair collection query and navigation responsiveness

## What

Repair planner statistics maintenance, count-only reads, unnecessary hidden content fetches, independent-query waterfalls, and measured collection SQL amplification. Preserve existing ownership, canonical recency, history visibility, and navigation state.

## Why

Authenticated Characters navigation stalls while imported-library reads use stale planner statistics. Source audit also identifies unnecessary collection and hidden-content work.

## Done when

Verify startup, long-lived and bulk-import planner maintenance with the deployed driver. Prove correct census and paging semantics, defer unseen phone requests without losing warm state, and remove independent-query waterfalls. Measure residual character recency, chat preview and participant enrichment at imported-library scale, repair material amplification, and cover production composition with focused node and component tests. Provide exact query and authenticated navigation evidence; distinguish remaining unmeasured paths.

## Evidence

Filled at landing: what ran and where its output is.
